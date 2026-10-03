import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  attachments,
  conversations,
  conversationMembers,
  messages,
  userBlocks,
  users,
} from '../db/schema';
import { requireAuth, sanitizeText, type AppEnv } from '../lib/auth';
import { generateId } from '../lib/ids';
import {
  flattenMessageRow,
  getMessageById,
  getMessageRowsForConversation,
  getConversationMembers,
  hydrateMessages,
  messageWithSenderSelect,
} from '../lib/hydrate';
import { areUsersBlocked, checkConversationAccess, sendMessage, toggleReaction } from '../lib/messaging';
import { broadcastConversationUpdate, broadcastToConversation, broadcastToUser } from '../ws/realtime';

export const messagesApp = new Hono<AppEnv>();
messagesApp.use('*', requireAuth);

// GET /api/messages/conversation/:conversationId
messagesApp.get('/conversation/:conversationId', async (c) => {
  const convId = c.req.param('conversationId');
  const userId = c.get('user').id;
  const db = getDb();
  const access = await checkConversationAccess(convId, userId);
  if (!access) return c.json({ error: 'You do not have access to this conversation.' }, 403);

  const before = c.req.query('before') || null;
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 10), 100);

  const rows = await getMessageRowsForConversation(convId, before, limit);
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const messageList = await hydrateMessages(sliced.reverse(), userId);

  const pinnedRows = await db
    .select(messageWithSenderSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.conversationId, convId),
        eq(messages.isPinned, true),
        eq(messages.isDeleted, false),
      ),
    )
    .orderBy(sql`${messages.createdAt} DESC`);

  const pinnedMessages = await hydrateMessages(pinnedRows.map(flattenMessageRow), userId);

  return c.json({ messages: messageList, hasMore, pinnedMessages });
});

// GET /api/messages/conversation/:conversationId/shared — media, files, links
messagesApp.get('/conversation/:conversationId/shared', async (c) => {
  const convId = c.req.param('conversationId');
  const userId = c.get('user').id;
  const access = await checkConversationAccess(convId, userId);
  if (!access) return c.json({ error: 'You do not have access to this conversation.' }, 403);

  const db = getDb();
  const attachmentRows = await db
    .select({ attachment: attachments, senderName: users.displayName, createdAt: messages.createdAt })
    .from(attachments)
    .innerJoin(messages, eq(messages.id, attachments.messageId))
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.conversationId, convId), eq(messages.isDeleted, false)))
    .orderBy(sql`${attachments.createdAt} DESC`);

  const linkRows = await db
    .select({ content: messages.content, createdAt: messages.createdAt, senderName: users.displayName })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.conversationId, convId),
        eq(messages.isDeleted, false),
        sql`${messages.content} LIKE '%http%'`,
      ),
    )
    .orderBy(sql`${messages.createdAt} DESC`)
    .limit(100);

  const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
  const links = linkRows.flatMap((row) => {
    const matches = row.content.match(urlRegex) || [];
    return matches.slice(0, 5).map((url) => ({
      url,
      senderName: row.senderName,
      createdAt: row.createdAt,
    }));
  });

  const isImage = (mime: string) => mime.startsWith('image/');
  const isAudio = (mime: string) => mime.startsWith('audio/');

  const media = attachmentRows
    .filter((r) => isImage(r.attachment.mimeType))
    .map((r) => ({
      id: r.attachment.id,
      url: r.attachment.url,
      mimeType: r.attachment.mimeType,
      fileName: r.attachment.fileName,
      senderName: r.senderName,
      createdAt: r.createdAt,
      width: r.attachment.width,
      height: r.attachment.height,
    }));

  const files = attachmentRows
    .filter((r) => !isImage(r.attachment.mimeType))
    .map((r) => ({
      id: r.attachment.id,
      url: r.attachment.url,
      fileName: r.attachment.fileName,
      fileType: r.attachment.fileType,
      mimeType: isAudio(r.attachment.mimeType) ? 'audio' : r.attachment.mimeType,
      fileSize: r.attachment.fileSize,
      senderName: r.senderName,
      createdAt: r.createdAt,
    }));

  return c.json({ media, files, links });
});

// POST /api/messages/conversation/:conversationId
messagesApp.post('/conversation/:conversationId', async (c) => {
  const convId = c.req.param('conversationId');
  const userId = c.get('user').id;
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({} as any));

  const content = sanitizeText(body?.content, 4000);
  const replyToId = typeof body?.replyToId === 'string' && body.replyToId ? body.replyToId : null;
  const tempId = typeof body?.tempId === 'string' ? body.tempId : null;
  const forwardedFromId = typeof body?.forwardedFromId === 'string' && body.forwardedFromId ? body.forwardedFromId : null;
  const attachmentIds = Array.isArray(body?.attachmentIds)
    ? body.attachmentIds.filter((a: unknown): a is string => typeof a === 'string').slice(0, 10)
    : [];

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
    replyToId,
    forwardedFromId,
    tempId,
    attachmentIds,
  });

  if (!result.ok) return c.json({ error: result.error }, 403 as any);
  return c.json({ message: result.message, tempId }, 201);
});

// PATCH /api/messages/:id — edit
messagesApp.patch('/:id', async (c) => {
  const messageId = c.req.param('id');
  const userId = c.get('user').id;
  const body = await c.req.json().catch(() => ({} as any));
  const content = sanitizeText(body?.content, 4000);

  if (!content) return c.json({ error: 'Edited message content cannot be empty.' }, 400);

  const db = getDb();
  const msgRows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msgRows[0]) return c.json({ error: 'Message not found.' }, 404);
  const msg = msgRows[0];

  if (msg.senderId !== userId) {
    return c.json({ error: 'You can only edit your own messages.' }, 403);
  }
  if (msg.isDeleted) {
    return c.json({ error: 'Cannot edit a deleted message.' }, 400);
  }

  const now = new Date().toISOString();
  await db
    .update(messages)
    .set({ content, isEdited: true, editedAt: now })
    .where(eq(messages.id, messageId));

  const memberIds = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, msg.conversationId));
  for (const member of memberIds) {
    const personalized = await getMessageById(messageId, member.userId);
    if (personalized) {
      broadcastToUser(member.userId, { type: 'message:edited', conversationId: msg.conversationId, message: personalized });
    }
  }

  return c.json({ message: await getMessageById(messageId, userId) });
});

// DELETE /api/messages/:id — soft delete
messagesApp.delete('/:id', async (c) => {
  const messageId = c.req.param('id');
  const userId = c.get('user').id;
  const db = getDb();

  const msgRows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msgRows[0]) return c.json({ error: 'Message not found.' }, 404);
  const msg = msgRows[0];

  const convRows = await db.select().from(conversations).where(eq(conversations.id, msg.conversationId)).limit(1);
  const myRoleRows = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(
      and(eq(conversationMembers.conversationId, msg.conversationId), eq(conversationMembers.userId, userId)),
    )
    .limit(1);

  const isOwner = convRows[0]?.createdBy === userId;
  const canDelete =
    msg.senderId === userId ||
    (convRows[0]?.type === 'group' && ['owner', 'admin'].includes(myRoleRows[0]?.role || '')) ||
    isOwner;
  if (!canDelete) {
    return c.json({ error: 'You do not have permission to delete this message.' }, 403);
  }

  const now = new Date().toISOString();
  await db
    .update(messages)
    .set({ isDeleted: true, deletedAt: now, isPinned: false, content: '' })
    .where(eq(messages.id, messageId));

  const deletedMsg = await getMessageById(messageId, userId);
  broadcastToConversation(msg.conversationId, {
    type: 'message:deleted',
    conversationId: msg.conversationId,
    messageId,
    deletedAt: now,
    message: deletedMsg || undefined,
  });

  return c.json({ success: true, messageId, deletedAt: now, message: deletedMsg });
});

// POST /api/messages/:id/reactions
messagesApp.post('/:id/reactions', async (c) => {
  const messageId = c.req.param('id');
  const userId = c.get('user').id;
  const db = getDb();
  const body = await c.req.json().catch(() => ({} as any));
  const emoji = sanitizeText(body?.emoji, 16);

  if (!emoji) return c.json({ error: 'Emoji is required.' }, 400);

  const result = await toggleReaction(messageId, userId, emoji);
  if (!result.ok) return c.json({ error: result.error }, (result.status || 500) as any);

  if (result.message) {
    const memberIds = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, result.message.conversationId));
    for (const member of memberIds) {
      const personalized = await getMessageById(messageId, member.userId);
      broadcastToUser(member.userId, {
        type: 'message:reaction',
        conversationId: result.message.conversationId,
        messageId,
        reactions: personalized?.reactions || [],
        message: personalized || undefined,
      });
    }
  }

  return c.json({ reactions: result.message?.reactions || [], message: result.message });
});

// POST /api/messages/:id/pin
messagesApp.post('/:id/pin', async (c) => {
  const messageId = c.req.param('id');
  const userId = c.get('user').id;
  const db = getDb();

  const msgRows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msgRows[0] || msgRows[0].isDeleted) return c.json({ error: 'Message not found.' }, 404);
  const msg = msgRows[0];

  const convId = msg.conversationId;
  const convRows = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, convId))
    .limit(1);
  const membershipRows = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)))
    .limit(1);

  if (!membershipRows[0]) return c.json({ error: 'Not a member of this conversation.' }, 403);

  if (convRows[0]?.type === 'group' && !['owner', 'admin'].includes(membershipRows[0].role)) {
    return c.json({ error: 'Only group owners and admins can pin or unpin messages.' }, 403);
  }

  const newPinned = !msg.isPinned;
  await db.update(messages).set({ isPinned: newPinned }).where(eq(messages.id, messageId));

  const updatedMsg = await getMessageById(messageId, userId);

  broadcastToConversation(convId, {
    type: 'message:pinned',
    conversationId: convId,
    messageId,
    isPinned: newPinned,
  });

  if (updatedMsg) {
    broadcastToConversation(convId, {
      type: 'message:updated',
      conversationId: convId,
      message: updatedMsg,
    });
  }

  const pinnedRows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, convId),
        eq(messages.isPinned, true),
        eq(messages.isDeleted, false),
      ),
    )
    .orderBy(sql`${messages.createdAt} DESC`)
    .limit(1);

  const updatedConv = await getConversationForUserSafe(convId, userId);
  return c.json({
    success: true,
    messageId,
    isPinned: newPinned,
    pinnedMessageId: pinnedRows[0]?.id ?? null,
    conversation: updatedConv,
  });
});

async function getConversationForUserSafe(convId: string, userId: string) {
  const { getConversationForUser } = await import('../lib/hydrate');
  return getConversationForUser(convId, userId);
}

// keep imports referenced
void getConversationMembers;
void userBlocks;
