import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { conversations, conversationMembers, messages, notifications, users } from '../db/schema';
import { requireAuth, sanitizeText, type AppEnv } from '../lib/auth';
import { generateId } from '../lib/ids';
import { getConversationForUser } from '../lib/hydrate';
import { broadcastConversationUpdate, broadcastToUser } from '../ws/realtime';

export const groupsApp = new Hono<AppEnv>();
groupsApp.use('*', requireAuth);

groupsApp.post('/', async (c) => {
  const userId = c.get('user').id;
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({} as any));
  const name = sanitizeText(body?.name, 80);
  const description = sanitizeText(body?.description, 300);
  const avatarUrl = body?.avatarUrl ? sanitizeText(body.avatarUrl, 500) : null;
  const rawMemberIds: unknown[] = Array.isArray(body?.memberIds) ? body.memberIds : [];

  if (!name || name.length < 2) {
    return c.json({ error: 'Group name must be at least 2 characters.' }, 400);
  }

  const uniqueMemberIds = Array.from(
    new Set(
      rawMemberIds
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim())
        .filter((id) => id !== userId),
    ),
  );

  const db = getDb();
  const convId = generateId('conv');
  const welcomeMsgId = generateId('msg');
  const now = new Date().toISOString();

  await db.insert(conversations).values({
    id: convId,
    type: 'group',
    name,
    description,
    avatarUrl,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  });

  await db.insert(conversationMembers).values({
    conversationId: convId,
    userId,
    role: 'owner',
    lastReadAt: now,
    joinedAt: now,
  });

  await db.insert(messages).values({
    id: welcomeMsgId,
    conversationId: convId,
    senderId: userId,
    content: `Created group "${name}"${description ? ` — ${description}` : ''}`,
    createdAt: now,
  });

  for (const memberId of uniqueMemberIds) {
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.id, memberId)).limit(1);
    if (exists[0]) {
      const already = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, memberId)))
        .limit(1);
      if (!already[0]) {
        await db.insert(conversationMembers).values({
          conversationId: convId,
          userId: memberId,
          role: 'member',
          joinedAt: now,
        });
      } else {
        await db
          .update(conversationMembers)
          .set({ isDeleted: false })
          .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, memberId)));
      }

      const notifId = generateId('notif');
      await db.insert(notifications).values({
        id: notifId,
        userId: memberId,
        type: 'group_invite',
        title: `Added to ${name}`,
        body: `${user.displayName} added you to group "${name}"`,
        conversationId: convId,
        messageId: welcomeMsgId,
        actorId: userId,
        createdAt: now,
      });
    }
  }

  for (const memberId of uniqueMemberIds) {
    const memberConv = await getConversationForUser(convId, memberId);
    if (memberConv) {
      broadcastToUser(memberId, { type: 'conversation:created', conversation: memberConv });
    }
  }

  const myConv = await getConversationForUser(convId, userId);
  return c.json({ conversation: myConv }, 201);
});

groupsApp.patch('/:id', async (c) => {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const db = getDb();

  const convRows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, convId), eq(conversations.type, 'group')))
    .limit(1);
  if (!convRows[0]) return c.json({ error: 'Group not found.' }, 404);
  const conv = convRows[0];

  const membershipRows = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)))
    .limit(1);

  if (!membershipRows[0] || !['owner', 'admin'].includes(membershipRows[0].role)) {
    return c.json({ error: 'Only group owners and admins can edit group details.' }, 403);
  }

  const body = await c.req.json().catch(() => ({} as any));
  const name = body?.name !== undefined ? sanitizeText(body.name, 80) : String(conv.name);
  const description =
    body?.description !== undefined ? sanitizeText(body.description, 300) : String(conv.description || '');
  const avatarUrl =
    body?.avatarUrl !== undefined
      ? body.avatarUrl
        ? sanitizeText(body.avatarUrl, 500)
        : null
      : conv.avatarUrl;

  if (!name || name.length < 2) {
    return c.json({ error: 'Group name must be at least 2 characters.' }, 400);
  }

  await db
    .update(conversations)
    .set({ name, description, avatarUrl, updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, convId));

  await broadcastConversationUpdate(convId);
  const updated = await getConversationForUser(convId, userId);
  return c.json({ conversation: updated });
});

groupsApp.post('/:id/members', async (c) => {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const db = getDb();

  const convRows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, convId), eq(conversations.type, 'group')))
    .limit(1);
  if (!convRows[0]) return c.json({ error: 'Group not found.' }, 404);

  const membershipRows = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)))
    .limit(1);

  if (!membershipRows[0] || !['owner', 'admin'].includes(membershipRows[0].role)) {
    return c.json({ error: 'Only group owners and admins can add members.' }, 403);
  }

  const body = await c.req.json().catch(() => ({} as any));
  const rawIds = Array.isArray(body?.memberIds)
    ? body.memberIds
    : Array.isArray(body?.userIds)
      ? body.userIds
      : body?.userId
        ? [String(body.userId)]
        : [];
  const memberIds: string[] = rawIds.filter((id: unknown): id is string => typeof id === 'string');

  if (memberIds.length === 0) {
    return c.json({ error: 'Specify at least one user to add.' }, 400);
  }

  const now = new Date().toISOString();
  for (const targetId of memberIds) {
    const userExists = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
    if (userExists[0]) {
      const existing = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, targetId)))
        .limit(1);
      if (existing[0]) {
        await db
          .update(conversationMembers)
          .set({ isDeleted: false })
          .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, targetId)));
      } else {
        await db.insert(conversationMembers).values({
          conversationId: convId,
          userId: targetId,
          role: 'member',
          joinedAt: now,
        });
      }
    }
  }

  await broadcastConversationUpdate(convId);
  const updated = await getConversationForUser(convId, userId);
  return c.json({ conversation: updated });
});

groupsApp.patch('/:id/members/:targetUserId', async (c) => {
  const convId = c.req.param('id');
  const targetUserId = c.req.param('targetUserId');
  const userId = c.get('user').id;
  const body = await c.req.json().catch(() => ({} as any));
  const newRole = body?.role;

  if (!['owner', 'admin', 'member'].includes(newRole)) {
    return c.json({ error: 'Role must be owner, admin, or member.' }, 400);
  }

  const db = getDb();
  const myMembership = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)))
    .limit(1);

  if (!myMembership[0] || myMembership[0].role !== 'owner') {
    return c.json({ error: 'Only the group owner can change member roles.' }, 403);
  }

  if (newRole === 'owner') {
    await db
      .update(conversationMembers)
      .set({ role: 'admin' })
      .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)));
  }
  await db
    .update(conversationMembers)
    .set({ role: newRole })
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, targetUserId)));

  await broadcastConversationUpdate(convId);
  const updated = await getConversationForUser(convId, userId);
  return c.json({ conversation: updated });
});

groupsApp.delete('/:id/members/:targetUserId', async (c) => {
  const convId = c.req.param('id');
  const targetUserId = c.req.param('targetUserId');
  const userId = c.get('user').id;
  const db = getDb();

  const myMembership = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)))
    .limit(1);
  const targetMembership = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, targetUserId)))
    .limit(1);

  if (!myMembership[0] || !targetMembership[0]) {
    return c.json({ error: 'Group member not found.' }, 404);
  }

  const myRole = myMembership[0].role;
  const targetRole = targetMembership[0].role;

  if (userId !== targetUserId && !['owner', 'admin'].includes(myRole)) {
    return c.json({ error: 'Only group owners and admins can remove members.' }, 403);
  }
  if (userId !== targetUserId && targetRole === 'owner') {
    return c.json({ error: 'The group owner cannot be removed.' }, 403);
  }
  if (myRole === 'admin' && targetRole === 'admin' && userId !== targetUserId) {
    return c.json({ error: 'Only the group owner can remove another admin.' }, 403);
  }

  await db
    .delete(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, targetUserId)));

  broadcastToUser(targetUserId, { type: 'group:member_removed', conversationId: convId, userId: targetUserId });
  await broadcastConversationUpdate(convId);

  const updated = await getConversationForUser(convId, userId);
  return c.json({ conversation: updated });
});

groupsApp.post('/:id/leave', async (c) => {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const db = getDb();

  const myMembership = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)))
    .limit(1);

  if (!myMembership[0]) {
    return c.json({ error: 'You are not a member of this group.' }, 404);
  }
  const myRole = myMembership[0].role;

  await db
    .delete(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)));

  const remaining = await db
    .select({ userId: conversationMembers.userId, role: conversationMembers.role, joinedAt: conversationMembers.joinedAt })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, convId))
    .orderBy(sql`CASE ${conversationMembers.role} WHEN 'admin' THEN 0 ELSE 1 END`, asc(conversationMembers.joinedAt));

  if (remaining.length === 0) {
    await db.delete(conversations).where(eq(conversations.id, convId));
  } else if (myRole === 'owner') {
    await db
      .update(conversationMembers)
      .set({ role: 'owner' })
      .where(
        and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, remaining[0].userId)),
      );
    await broadcastConversationUpdate(convId);
  } else {
    await broadcastConversationUpdate(convId);
  }

  return c.json({ success: true, conversationId: convId, remainingMembers: remaining.length });
});
