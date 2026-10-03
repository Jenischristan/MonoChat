import { and, eq, ne, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  attachments,
  conversations,
  conversationMembers,
  messages,
  messageReactions,
  notifications as notificationsTable,
  readReceipts,
  userBlocks,
} from '../db/schema';
import { generateId } from './ids';
import { getMessageById, getConversationMemberIds, getPinnedMessageRows } from './hydrate';
import type { Message } from '../../src/types/messaging';

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatar: string | null;
  content: string;
  replyToId?: string | null;
  forwardedFromId?: string | null;
  attachmentIds?: string[];
  tempId?: string | null;
}

export interface SendMessageResult {
  ok: boolean;
  status?: number;
  error?: string;
  message?: Message;
}

export async function checkConversationAccess(
  conversationId: string,
  userId: string,
): Promise<{ member: typeof conversationMembers.$inferSelect; conv: typeof conversations.$inferSelect } | null> {
  const db = getDb();
  const rows = await db
    .select({ member: conversationMembers, conv: conversations })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)),
    )
    .limit(1);
  return rows[0] || null;
}

export async function areUsersBlocked(a: string, b: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Core send-message pipeline shared by /api/messages and /api/conversations/:id/messages */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const db = getDb();
  const {
    conversationId: convId,
    senderId: userId,
    senderDisplayName,
    senderAvatar,
    content,
    replyToId = null,
    forwardedFromId = null,
    attachmentIds = [],
    tempId = null,
  } = input;

  const access = await checkConversationAccess(convId, userId);
  if (!access) return { ok: false, status: 404, error: 'Conversation not found.' };
  const { conv } = access;

  if (conv.type === 'direct') {
    const otherRows = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, convId), ne(conversationMembers.userId, userId)))
      .limit(1);
    const otherMember = otherRows[0];
    if (otherMember && (await areUsersBlocked(userId, otherMember.userId))) {
      return { ok: false, status: 403, error: 'Cannot send message because this conversation is blocked.' };
    }
  }

  const messageId = generateId('msg');
  const now = new Date().toISOString();

  await db.insert(messages).values({
    id: messageId,
    conversationId: convId,
    senderId: userId,
    content,
    replyToId,
    forwardedFromId,
    createdAt: now,
  });

  for (const attId of attachmentIds) {
    const existingAtt = await db.select().from(attachments).where(eq(attachments.id, attId)).limit(1);
    if (!existingAtt[0]) continue;
    if (!existingAtt[0].messageId) {
      await db
        .update(attachments)
        .set({ messageId })
        .where(and(eq(attachments.id, attId), or(eq(attachments.uploaderId, userId), sql`${attachments.uploaderId} IS NULL`)));
    } else {
      // Cloned attachment (forwarded message content)
      await db.insert(attachments).values({
        id: generateId('att'),
        messageId,
        uploaderId: userId,
        fileName: existingAtt[0].fileName,
        fileType: existingAtt[0].fileType,
        mimeType: existingAtt[0].mimeType,
        fileSize: existingAtt[0].fileSize,
        url: existingAtt[0].url,
        width: existingAtt[0].width,
        height: existingAtt[0].height,
        createdAt: now,
      });
    }
  }

  await db
    .update(conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(conversations.id, convId));

  // Clear draft and update sender's read marker
  await db
    .update(conversationMembers)
    .set({ draftText: '', lastReadMessageId: messageId, lastReadAt: now, markedUnread: false, isDeleted: false })
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)));

  // Ensure conversation is visible (not deleted) for other participants
  await db
    .update(conversationMembers)
    .set({ isDeleted: false })
    .where(and(eq(conversationMembers.conversationId, convId), ne(conversationMembers.userId, userId)));

  // Create notifications for other members who have not muted the conversation
  const otherMembers = await db
    .select({ userId: conversationMembers.userId, isMuted: conversationMembers.isMuted })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), ne(conversationMembers.userId, userId)));

  for (const om of otherMembers) {
    if (om.isMuted) continue;
    const isReplyToThemRows = replyToId
      ? await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.id, replyToId), eq(messages.senderId, om.userId)))
          .limit(1)
      : [];
    const isReplyToThem = isReplyToThemRows.length > 0;
    const notifType = isReplyToThem ? 'reply' : 'message';
    const title =
      conv.type === 'group'
        ? `${senderDisplayName} in ${conv.name}`
        : isReplyToThem
          ? `${senderDisplayName} replied to your message`
          : `New message from ${senderDisplayName}`;
    const body = content || (attachmentIds.length > 0 ? 'Sent an attachment' : 'New message');

    const notifId = generateId('notif');
    await db.insert(notificationsTable).values({
      id: notifId,
      userId: om.userId,
      type: notifType,
      title,
      body: body.slice(0, 160),
      conversationId: convId,
      messageId,
      actorId: userId,
      createdAt: now,
    });

    const { broadcastToUser } = await import('../ws/realtime');
    broadcastToUser(om.userId, {
      type: 'notification:new',
      notification: {
        id: notifId,
        userId: om.userId,
        type: notifType,
        title,
        body: body.slice(0, 160),
        conversationId: convId,
        messageId,
        actorId: userId,
        actorName: senderDisplayName,
        actorAvatar: senderAvatar,
        isRead: false,
        createdAt: now,
      },
    });
  }

  const hydratedForSender = await getMessageById(messageId, userId);

  // Broadcast message to each member of the conversation (personalized per member)
  const memberIds = await getConversationMemberIds(convId);
  const { broadcastToUser, broadcastConversationUpdate } = await import('../ws/realtime');
  for (const memberId of memberIds) {
    const personalizedMsg = await getMessageById(messageId, memberId);
    if (!personalizedMsg) continue;
    broadcastToUser(memberId, {
      type: 'message:new',
      conversationId: convId,
      message: personalizedMsg,
      tempId: memberId === userId ? tempId || undefined : undefined,
    });
  }

  await broadcastConversationUpdate(convId);

  return { ok: true, message: hydratedForSender! };
}


/** Toggle a reaction for a message, returning the updated reaction summaries */
export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<{ ok: boolean; status?: number; error?: string; message?: Message | null }> {
  const db = getDb();
  const msgRows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msgRows[0]) return { ok: false, status: 404, error: 'Message not found.' };

  const convId = msgRows[0].conversationId;
  const memberRows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)))
    .limit(1);
  if (!memberRows[0]) return { ok: false, status: 403, error: 'Not a member of this conversation.' };

  const existing = await db
    .select()
    .from(messageReactions)
    .where(
      and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji)),
    )
    .limit(1);

  if (existing[0]) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
  } else {
    await db.insert(messageReactions).values({
      id: generateId('rea'),
      messageId,
      userId,
      emoji,
      createdAt: new Date().toISOString(),
    });
  }

  const message = await getMessageById(messageId, userId);
  return { ok: true, message };
}

export async function markConversationRead(
  convId: string,
  userId: string,
  displayName: string,
  username: string,
  avatarUrl: string | null,
): Promise<{ conversation: Awaited<ReturnType<typeof import('./hydrate').getConversationForUser>> }> {
  const db = getDb();
  const now = new Date().toISOString();
  const latestRows = await db
    .select({ id: messages.id, createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(sql`${messages.createdAt} DESC`)
    .limit(1);

  const lastReadMessageId = latestRows[0]?.id ?? null;
  const readTimestamp =
    latestRows[0] && latestRows[0].createdAt > now ? latestRows[0].createdAt : now;

  await db
    .update(conversationMembers)
    .set({ lastReadMessageId, lastReadAt: readTimestamp, markedUnread: false })
    .where(and(eq(conversationMembers.conversationId, convId), eq(conversationMembers.userId, userId)));

  const unreadMsgs = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, convId),
        ne(messages.senderId, userId),
        eq(messages.isDeleted, false),
      ),
    );

  for (const m of unreadMsgs) {
    const exists = await db
      .select({ messageId: readReceipts.messageId })
      .from(readReceipts)
      .where(and(eq(readReceipts.messageId, m.id), eq(readReceipts.userId, userId)))
      .limit(1);
    if (!exists[0]) {
      await db.insert(readReceipts).values({
        messageId: m.id,
        conversationId: convId,
        userId,
        readAt: now,
      });
    }
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.conversationId, convId)));

  const { broadcastToConversation } = await import('../ws/realtime');
  if (lastReadMessageId) {
    broadcastToConversation(
      convId,
      {
        type: 'conversation:read',
        conversationId: convId,
        userId,
        displayName,
        username,
        avatarUrl,
        lastReadMessageId,
        readAt: now,
      },
      userId,
    );
  }

  const { getConversationForUser } = await import('./hydrate');
  const conversation = await getConversationForUser(convId, userId);
  return { conversation };
}

export async function getPinnedMessagesFor(convId: string, userId: string): Promise<Message[]> {
  const rows = await getPinnedMessageRows(convId);
  const { hydrateMessages } = await import('./hydrate');
  return hydrateMessages(rows, userId);
}
