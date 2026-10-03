import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { attachments, conversations, conversationMembers, messages, messageReactions, readReceipts, users } from '../db/schema';
import { requireAuth, sanitizeText, type AppEnv } from '../lib/auth';
import { generateId } from '../lib/ids';
import {
  flattenMessageRow,
  getAllConversationsForUser,
  getConversationForUser,
  getMessageRowsForConversation,
  hydrateMessages,
  messageWithSenderSelect,
} from '../lib/hydrate';
import { areUsersBlocked, checkConversationAccess, markConversationRead, sendMessage } from '../lib/messaging';
import { zodErrorToMessage } from '../lib/validation';
import { z } from 'zod';

export const conversationsApp = new Hono<AppEnv>();
conversationsApp.use('*', requireAuth);

// GET /api/conversations — hydrated list for the current user
conversationsApp.get('/', async (c) => {
  const userId = c.get('user').id;
  const includeArchived = c.req.query('includeArchived') === '1' || c.req.query('includeArchived') === 'true';
  let conversationsList = await getAllConversationsForUser(userId);
  if (!includeArchived) {
    conversationsList = conversationsList.filter((conv) => !conv.isArchived);
  }
  return c.json({ conversations: conversationsList });
});

// POST /api/conversations/direct — create (or return existing) 1:1 DM
conversationsApp.post('/direct', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json().catch(() => ({} as any));
  const db = getDb();

  let targetUserId = sanitizeText(body?.targetUserId || body?.userId, 80);
  const contactName = sanitizeText(body?.contactName || body?.displayName, 60);
  const rawContactUsername = sanitizeText(body?.contactUsername || body?.username, 30)
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '');

  // Resolve by username / display name when no id was supplied
  if (!targetUserId && (contactName || rawContactUsername)) {
    const cleanUsername = rawContactUsername || contactName.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24);
    const existingContact = await db
      .select({ id: users.id })
      .from(users)
      .where(
        sql`LOWER(${users.username}) = ${cleanUsername} OR LOWER(${users.displayName}) = ${contactName.toLowerCase()}`,
      )
      .limit(1);

    if (existingContact[0]) {
      targetUserId = existingContact[0].id;
    } else {
      return c.json({ error: 'User not found. Please select a registered user.' }, 404);
    }
  }

  if (!targetUserId) {
    return c.json({ error: 'Please select a valid user to message.' }, 400);
  }

  // Self-chat ("Saved Messages")
  if (targetUserId === userId) {
    const savedConvId = await ensureSavedMessagesConversation(userId);
    const conv = await getConversationForUser(savedConvId, userId);
    return c.json({ conversation: conv, created: false });
  }

  const target = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target.length) {
    return c.json({ error: 'Target user not found.' }, 404);
  }

  if (await areUsersBlocked(userId, targetUserId)) {
    return c.json({ error: 'Cannot start a conversation with this user.' }, 403);
  }

  // Dedupe: single direct conversation with exactly these two members
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      sql`${conversationMembers} as cm1`,
      sql`cm1.conversation_id = ${conversations.id} AND cm1.user_id = ${userId}`,
    )
    .innerJoin(
      sql`${conversationMembers} as cm2`,
      sql`cm2.conversation_id = ${conversations.id} AND cm2.user_id = ${targetUserId}`,
    )
    .where(
      sql`${conversations.type} = 'direct' AND (SELECT COUNT(*) FROM ${conversationMembers} cm3 WHERE cm3.conversation_id = ${conversations.id}) = 2`,
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(conversationMembers)
      .set({ isDeleted: false, isArchived: false })
      .where(and(eq(conversationMembers.conversationId, existing[0].id), eq(conversationMembers.userId, userId)));
    const convData = await getConversationForUser(existing[0].id, userId);
    return c.json({ conversation: convData, created: false });
  }

  const now = new Date().toISOString();
  const convId = generateId('conv');
  await db.insert(conversations).values({
    id: convId,
    type: 'direct',
    name: null,
    description: '',
    avatarUrl: null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  });
  for (const member of [userId, targetUserId]) {
    await db.insert(conversationMembers).values({
      conversationId: convId,
      userId: member,
      role: 'owner',
      joinedAt: now,
    });
  }

  const convData = await getConversationForUser(convId, userId);
  const { broadcastToUser } = await import('../ws/realtime');
  if (convData) {
    broadcastToUser(targetUserId, { type: 'conversation:created', conversation: convData });
  }
  return c.json({ conversation: convData, created: true }, 201);
});

/** Finds or creates the personal "Saved Messages" conversation. */
export async function ensureSavedMessagesConversation(userId: string): Promise<string> {
  const db = getDb();
  const savedExists = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      sql`${conversationMembers} as cm`,
      sql`cm.conversation_id = ${conversations.id} AND cm.user_id = ${userId}`,
    )
    .where(
      sql`${conversations.type} = 'direct' AND (SELECT COUNT(*) FROM ${conversationMembers} cm2 WHERE cm2.conversation_id = ${conversations.id}) = 1`,
    )
    .limit(1);

  if (savedExists[0]) {
    await db
      .update(conversations)
      .set({ name: 'Saved Messages', description: 'Personal notes, links, and file storage.' })
      .where(sql`${conversations.id} = ${savedExists[0].id} AND (${conversations.name} IS NULL OR ${conversations.name} = '')`);
    return savedExists[0].id;
  }

  const savedConvId = generateId('conv');
  const now = new Date().toISOString();
  await db.insert(conversations).values({
    id: savedConvId,
    type: 'direct',
    name: 'Saved Messages',
    description: 'Personal notes, links, and file storage.',
    avatarUrl: null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  });
  await db.insert(conversationMembers).values({
    conversationId: savedConvId,
    userId,
    role: 'owner',
    lastReadAt: now,
    joinedAt: now,
  });
  return savedConvId;
}

// GET /api/conversations/:id
conversationsApp.get('/:id', async (c) => {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const conv = await getConversationForUser(convId, userId);
  if (!conv) return c.json({ error: 'Conversation not found.' }, 404);
  return c.json({ conversation: conv });
});

// GET /api/conversations/:id/messages — cursor pagination
conversationsApp.get('/:id/messages', async (c) => {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const db = getDb();
  const access = await checkConversationAccess(convId, userId);
  if (!access) return c.json({ error: 'You do not have access to this conversation.' }, 403);

  const before = c.req.query('before') || null;
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 10), 100);

  const rows = await getMessageRowsForConversation(convId, before, limit);
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const messageList = (await hydrateMessages(sliced.reverse(), userId)).map((m) => ({ ...m, tempId: undefined }));

  const pinnedRows = await db
    .select(messageWithSenderSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.conversationId, convId), eq(messages.isPinned, true), eq(messages.isDeleted, false)))
    .orderBy(sql`${messages.createdAt} DESC`);

  const pinnedMessages = await hydrateMessages(pinnedRows.map(flattenMessageRow), userId);

  return c.json({ messages: messageList, hasMore, pinnedMessages });
});

const sendMessageSchema = z.object({
  content: z.string().max(8000).optional().default(''),
  replyToId: z.string().optional().nullable(),
  tempId: z.string().optional().nullable(),
  forwardedFromId: z.string().optional().nullable(),
  attachmentIds: z.array(z.string()).optional().default([]),
});

// POST /api/conversations/:id/messages — send
conversationsApp.post('/:id/messages', async (c) => {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const user = c.get('user');

  const parsed = sendMessageSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: zodErrorToMessage(parsed.error) }, 400);
  const body = parsed.data;

  const content = sanitizeText(body.content, 4000);
  const attachmentIds = (body.attachmentIds || []).filter((a: unknown) => typeof a === 'string').slice(0, 10);
  if (!content && attachmentIds.length === 0) {
    return c.json({ error: 'Message cannot be empty.' }, 400);
  }

  const access = await checkConversationAccess(convId, userId);
  if (!access) return c.json({ error: 'Conversation not found.' }, 404);

  const result = await sendMessage({
    conversationId: convId,
    senderId: userId,
    senderDisplayName: user.displayName,
    senderAvatar: user.avatarUrl,
    content,
    replyToId: body.replyToId || null,
    forwardedFromId: body.forwardedFromId || null,
    tempId: body.tempId || null,
    attachmentIds,
  });

  if (!result.ok) return c.json({ error: result.error }, (result.status || 500) as 403);
  return c.json({ message: result.message, tempId: body.tempId || null }, 201);
});

// PATCH /:id/state | /:id/settings | /:id — member-level conversation state
async function handleUpdateConversationSettings(c: any) {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const body = await c.req.json().catch(() => ({} as any));
  const db = getDb();

  const memberRows = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)))
    .limit(1);
  if (!memberRows[0]) {
    return c.json({ error: 'Conversation membership not found.' }, 404);
  }
  const member = memberRows[0];

  const isPinned = body?.isPinned !== undefined ? Boolean(body.isPinned) : member.isPinned;
  const isMuted = body?.isMuted !== undefined ? Boolean(body.isMuted) : member.isMuted;
  const isArchived = body?.isArchived !== undefined ? Boolean(body.isArchived) : member.isArchived;
  const isDeleted = body?.isDeleted !== undefined ? Boolean(body.isDeleted) : member.isDeleted;
  const markedUnreadRaw =
    body?.markedUnread !== undefined ? body.markedUnread : body?.unreadOverride !== undefined ? body.unreadOverride : undefined;
  const markedUnread = markedUnreadRaw !== undefined ? Boolean(markedUnreadRaw) : member.markedUnread;
  const draftText =
    body?.draftText !== undefined
      ? typeof body.draftText === 'string'
        ? body.draftText.slice(0, 4000)
        : ''
      : member.draftText;

  await db
    .update(conversationMembers)
    .set({ isPinned, isMuted, isArchived, isDeleted, markedUnread, draftText })
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)));

  if (isDeleted) {
    return c.json({ deleted: true, conversationId: convId });
  }

  const updated = await getConversationForUser(convId, userId);
  return c.json({ conversation: updated });
}

conversationsApp.patch('/:id/state', handleUpdateConversationSettings);
conversationsApp.patch('/:id/settings', handleUpdateConversationSettings);
conversationsApp.patch('/:id', handleUpdateConversationSettings);

// POST /:id/read — mark read + receipts
conversationsApp.post('/:id/read', async (c) => {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const user = c.get('user');

  const access = await checkConversationAccess(convId, userId);
  if (!access) return c.json({ error: 'Conversation not found.' }, 404);

  const { conversation } = await markConversationRead(
    convId,
    userId,
    user.displayName,
    user.username,
    user.avatarUrl,
  );
  return c.json({ conversation });
});

// POST /:id/clear — clear history (keeps conversation). Group clear requires owner/admin.
conversationsApp.post('/:id/clear', async (c) => {
  const convId = c.req.param('id');
  const userId = c.get('user').id;
  const db = getDb();

  const access = await checkConversationAccess(convId, userId);
  if (!access) return c.json({ error: 'Conversation not found.' }, 404);

  if (access.conv.type === 'group' && !['owner', 'admin'].includes(access.member.role)) {
    return c.json({ error: 'Only group owners and admins can clear this conversation.' }, 403);
  }

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
    .update(conversations)
    .set({ lastMessageAt: null, updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, convId));

  const updated = await getConversationForUser(convId, userId);
  const { broadcastToConversation } = await import('../ws/realtime');
  broadcastToConversation(convId, { type: 'conversation:cleared', conversationId: convId });

  return c.json({ conversation: updated, cleared: true });
});
