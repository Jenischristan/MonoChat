import { Hono } from 'hono';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  attachments,
  conversations,
  conversationMembers,
  messages,
  messageReactions,
  notifications,
  readReceipts,
  reports,
  sessions,
  userBlocks,
  userSettings,
  users,
} from '../db/schema';
import { hydrateUser, requireAuth, sanitizeText, verifyPassword, type AppEnv } from '../lib/auth';
import { generateId } from '../lib/ids';
import { getAllConversationsForUser } from '../lib/hydrate';
import { broadcastConversationUpdate, broadcastGlobal } from '../ws/realtime';

export const usersApp = new Hono<AppEnv>();
usersApp.use('*', requireAuth);

// GET /api/users?q=&excludeSelf=
usersApp.get('/', async (c) => {
  const rawQuery = c.req.query('q');
  const rawQ = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  const q = sanitizeText(rawQ, 80).toLowerCase();
  const cleanQ = q.replace(/^@+/, '').trim();
  const excludeSelf = c.req.query('excludeSelf') === '1' || c.req.query('excludeSelf') === 'true';
  const userId = c.get('user').id;
  const db = getDb();

  let rows: (typeof users.$inferSelect)[];
  if (q) {
    const like = `%${q}%`;
    const cleanLike = `%${cleanQ}%`;
    const conditions = sql`(
      LOWER(${users.username}) LIKE ${cleanLike}
      OR LOWER(${users.username}) LIKE ${like}
      OR LOWER(${users.displayName}) LIKE ${like}
      OR LOWER(${users.bio}) LIKE ${like}
      OR LOWER(${users.title}) LIKE ${like}
      OR LOWER(${users.email}) LIKE ${like}
      OR LOWER(${users.location}) LIKE ${like}
    )`;
    rows = await db
      .select()
      .from(users)
      .where(excludeSelf ? and(conditions, ne(users.id, userId)) : conditions)
      .orderBy(desc(users.isOnline), sql`${users.displayName} ASC`)
      .limit(50);
  } else {
    rows = await db
      .select()
      .from(users)
      .where(excludeSelf ? ne(users.id, userId) : undefined)
      .orderBy(desc(users.isOnline), sql`${users.displayName} ASC`)
      .limit(50);
  }

  return c.json({ users: rows.map((r) => hydrateUser(r)) });
});

usersApp.get('/me/blocked', async (c) => {
  const userId = c.get('user').id;
  const db = getDb();
  const rows = await db
    .select({ user: users, createdAt: userBlocks.createdAt })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, userId))
    .orderBy(desc(userBlocks.createdAt));
  return c.json({ blockedUsers: rows.map((r) => hydrateUser(r.user)) });
});

usersApp.post('/:id/block', async (c) => {
  const userId = c.get('user').id;
  const targetId = c.req.param('id');
  if (targetId === userId) {
    return c.json({ error: 'You cannot block yourself.' }, 400);
  }
  const db = getDb();
  const target = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
  if (target.length === 0) return c.json({ error: 'User not found.' }, 404);

  const existing = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, targetId)))
    .limit(1);
  if (existing.length === 0) {
    await db
      .insert(userBlocks)
      .values({ blockerId: userId, blockedId: targetId, createdAt: new Date().toISOString() });
  }
  return c.json({ blocked: true, blockedUserId: targetId });
});

usersApp.delete('/:id/block', async (c) => {
  const userId = c.get('user').id;
  const targetId = c.req.param('id');
  const db = getDb();
  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, targetId)));
  return c.json({ blocked: false, blockedUserId: targetId });
});

usersApp.post('/report', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json().catch(() => ({} as any));
  const db = getDb();

  const targetType = ['user', 'conversation', 'message'].includes(body?.targetType)
    ? body.targetType
    : null;
  const reason = sanitizeText(body?.reason, 120);
  if (!targetType) return c.json({ error: 'Invalid report target.' }, 400);
  if (!reason) return c.json({ error: 'Please select a reason for the report.' }, 400);

  const targetId = sanitizeText(body?.targetId, 120);
  if (!targetId) return c.json({ error: 'Report target is missing.' }, 400);

  let targetUserId: string | null = null;
  let targetName = '';

  if (targetType === 'user') {
    const rows = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!rows[0]) return c.json({ error: 'User not found.' }, 404);
    targetUserId = rows[0].id;
    targetName = rows[0].displayName;
  } else if (targetType === 'conversation') {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, targetId))
      .limit(1);
    if (!rows[0]) return c.json({ error: 'Conversation not found.' }, 404);
    targetName = rows[0].name || (rows[0].type === 'direct' ? 'Direct conversation' : 'Group');
  } else {
    const rows = await db
      .select({ message: messages, sender: users })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.id, targetId))
      .limit(1);
    if (!rows[0]) return c.json({ error: 'Message not found.' }, 404);
    targetUserId = rows[0].sender.id;
    targetName = `message from ${rows[0].sender.displayName}`;
  }

  const details = sanitizeText(body?.details, 2000);
  const blockUser = Boolean(body?.blockUser);

  const reportId = generateId('rpt');
  await db.insert(reports).values({
    id: reportId,
    reporterId: userId,
    targetType,
    targetId,
    targetUserId,
    targetName,
    reason,
    details,
    blockUser,
    status: 'submitted',
    createdAt: new Date().toISOString(),
  });

  if (blockUser && targetUserId && targetUserId !== userId) {
    const existing = await db
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, targetUserId)))
      .limit(1);
    if (existing.length === 0) {
      await db
        .insert(userBlocks)
        .values({ blockerId: userId, blockedId: targetUserId, createdAt: new Date().toISOString() });
    }
  }

  return c.json(
    {
      success: true,
      reportId,
      report: {
        id: reportId,
        reporterId: userId,
        targetType,
        targetId,
        targetUserId,
        targetName,
        reason,
        details,
        status: 'submitted',
        createdAt: new Date().toISOString(),
      },
    },
    201,
  );
});

usersApp.get('/me/reports', async (c) => {
  const userId = c.get('user').id;
  const db = getDb();
  const rows = await db
    .select()
    .from(reports)
    .where(eq(reports.reporterId, userId))
    .orderBy(desc(reports.createdAt))
    .limit(100);
  return c.json({
    reports: rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      targetName: r.targetName,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
});

usersApp.patch('/me', async (c) => {
  const userId = c.get('user').id;
  const currentUser = c.get('user');
  const body = await c.req.json().catch(() => ({} as any));
  const db = getDb();

  const displayName =
    body?.displayName !== undefined
      ? sanitizeText(body.displayName, 60)
      : currentUser.displayName;
  const username =
    body?.username !== undefined
      ? sanitizeText(body.username, 30).toLowerCase().replace(/^@+/, '')
      : currentUser.username;
  const bio = body?.bio !== undefined ? sanitizeText(body.bio, 300) : currentUser.bio;
  const statusText =
    body?.statusText !== undefined ? sanitizeText(body.statusText, 80) : currentUser.statusText;
  const phone = body?.phone !== undefined ? sanitizeText(body.phone, 40) : currentUser.phone || '';
  const pronouns =
    body?.pronouns !== undefined ? sanitizeText(body.pronouns, 40) : currentUser.pronouns || '';
  const title = body?.title !== undefined ? sanitizeText(body.title, 80) : currentUser.title || '';
  const location =
    body?.location !== undefined ? sanitizeText(body.location, 80) : currentUser.location || '';
  const website =
    body?.website !== undefined ? sanitizeText(body.website, 160) : currentUser.website || '';
  const avatarUrl =
    body?.avatarUrl !== undefined
      ? body.avatarUrl
        ? sanitizeText(body.avatarUrl, 500)
        : null
      : currentUser.avatarUrl;

  if (!displayName || displayName.length < 2) {
    return c.json({ error: 'Display name must be at least 2 characters.' }, 400);
  }

  if (!username || !/^[a-z0-9_.-]{2,30}$/.test(username)) {
    return c.json(
      { error: 'Username must be 2–30 characters (lowercase letters, numbers, ., _, -).' },
      400,
    );
  }

  if (username !== currentUser.username) {
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), ne(users.id, userId)))
      .limit(1);
    if (taken[0]) {
      return c.json({ error: 'That username is already in use.' }, 409);
    }
  }

  await db
    .update(users)
    .set({
      displayName,
      username,
      bio,
      statusText,
      phone,
      pronouns,
      title,
      location,
      website,
      avatarUrl,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId));

  const settingsRow = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const userRow = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  // Presence of avatar/display name changes affects conversation hydration
  const memberConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  for (const row of memberConvs) {
    await broadcastConversationUpdate(row.conversationId);
  }

  return c.json({ user: hydrateUser(userRow[0], settingsRow[0]) });
});

usersApp.post('/me/email', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json().catch(() => ({} as any));
  const email = sanitizeText(body?.email, 120).toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || !email.includes('@')) {
    return c.json({ error: 'Please provide a valid email address.' }, 400);
  }

  const db = getDb();
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRows[0] || !verifyPassword(password, userRows[0].passwordHash)) {
    return c.json({ error: 'Password confirmation failed.' }, 400);
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`LOWER(${users.email}) = ${email}`, ne(users.id, userId)))
    .limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'That email is already in use.' }, 409);
  }

  await db
    .update(users)
    .set({ email, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId));

  return c.json({ success: true, email });
});

usersApp.patch('/me/settings', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json().catch(() => ({} as any));
  const db = getDb();

  const currentRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const current = currentRows[0];

  const theme = ['light', 'dark', 'system'].includes(body?.theme)
    ? body.theme
    : current?.theme || 'dark';

  const boolOr = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;

  const values = {
    userId,
    theme,
    notificationsEnabled: boolOr(body?.notificationsEnabled, current?.notificationsEnabled ?? true),
    soundEnabled: boolOr(body?.soundEnabled, current?.soundEnabled ?? true),
    desktopNotifications: boolOr(body?.desktopNotifications, current?.desktopNotifications ?? false),
    showReadReceipts: boolOr(body?.showReadReceipts, current?.showReadReceipts ?? true),
    showOnlineStatus: boolOr(body?.showOnlineStatus, current?.showOnlineStatus ?? true),
    showTypingIndicator: boolOr(body?.showTypingIndicator, current?.showTypingIndicator ?? true),
    enterToSend: boolOr(body?.enterToSend, current?.enterToSend ?? true),
    messagePreview: boolOr(body?.messagePreview, current?.messagePreview ?? true),
    compactMode: boolOr(body?.compactMode, current?.compactMode ?? false),
    fontSize: ['small', 'medium', 'large'].includes(body?.fontSize)
      ? body.fontSize
      : current?.fontSize || 'medium',
    allowDirectMessages: ['everyone', 'contacts'].includes(body?.allowDirectMessages)
      ? body.allowDirectMessages
      : current?.allowDirectMessages || 'everyone',
    chatWallpaper: typeof body?.chatWallpaper === 'string' && body.chatWallpaper
      ? body.chatWallpaper
      : current?.chatWallpaper || 'solid-obsidian',
  };

  if (current) {
    await db.update(userSettings).set(values).where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values(values);
  }

  const settingsRow = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const userRow = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  return c.json({ user: hydrateUser(userRow[0], settingsRow[0]) });
});

usersApp.get('/me/export', async (c) => {
  const userId = c.get('user').id;
  const db = getDb();
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const settingsRows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const conversationsData = await getAllConversationsForUser(userId);
  const messageRows = await db
    .select({ message: messages })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, userId)),
    )
    .orderBy(desc(messages.createdAt))
    .limit(5000);
  const notificationRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(1000);

  return c.json({
    exportedAt: new Date().toISOString(),
    account: hydrateUser(userRows[0], settingsRows[0]),
    conversationsCount: conversationsData.length,
    conversations: conversationsData.map((conv) => ({
      id: conv.id,
      type: conv.type,
      name: conv.name,
      membersCount: conv.members.length,
      lastMessageAt: conv.lastMessageAt,
    })),
    sentMessagesCount: messageRows.length,
    sentMessages: messageRows.map((r) => ({
      id: r.message.id,
      conversationId: r.message.conversationId,
      senderId: r.message.senderId,
      content: r.message.content,
      createdAt: r.message.createdAt,
      isEdited: r.message.isEdited,
      isDeleted: r.message.isDeleted,
    })),
    notifications: notificationRows,
  });
});

usersApp.post('/me/clear-all-chats', async (c) => {
  const userId = c.get('user').id;
  const db = getDb();

  const memberConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  for (const row of memberConvs) {
    const convId = row.conversationId;
    const msgRows = await db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, convId));
    for (const msg of msgRows) {
      await db.delete(messageReactions).where(eq(messageReactions.messageId, msg.id));
      await db.delete(readReceipts).where(eq(readReceipts.messageId, msg.id));
    }
    await db.delete(attachments).where(
      sql`${attachments.messageId} IN (SELECT id FROM messages WHERE conversation_id = ${convId})`,
    );
    await db.delete(messages).where(eq(messages.conversationId, convId));
    await db
      .update(conversationMembers)
      .set({ lastReadMessageId: null, lastReadAt: new Date().toISOString(), markedUnread: false })
      .where(eq(conversationMembers.conversationId, convId));
    await db
      .update(conversations)
      .set({ lastMessageAt: null, updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, convId));
    await broadcastConversationUpdate(convId);
  }

  return c.json({ success: true, clearedConversations: memberConvs.length });
});

usersApp.delete('/me', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json().catch(() => ({} as any));
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!password) {
    return c.json({ error: 'Password confirmation is required to delete your account.' }, 400);
  }

  const db = getDb();
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRows[0] || !verifyPassword(password, userRows[0].passwordHash)) {
    return c.json({ error: 'Password confirmation failed.' }, 401);
  }

  // Direct conversations become empty → cascade removes them via member cleanup
  await db.delete(users).where(eq(users.id, userId));
  await broadcastGlobal({
    type: 'presence:update',
    userId,
    isOnline: false,
    lastSeenAt: new Date().toISOString(),
  });

  return c.json({ success: true });
});
