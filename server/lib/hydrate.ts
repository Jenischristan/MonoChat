import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  attachments,
  conversationMembers,
  conversations,
  messages,
  messageReactions,
  readReceipts,
  users,
} from '../db/schema';
import type {
  Attachment,
  Conversation,
  ConversationMember,
  GroupRole,
  Message,
  MessageReactionSummary,
  ReadReceiptUser,
  ReplyPreviewData,
} from '../../src/types/messaging';

export type MessageRow = typeof messages.$inferSelect & {
  senderName: string;
  senderUsername: string;
  senderAvatar: string | null;
};

export const messageWithSenderSelect = {
  message: messages,
  senderName: users.displayName,
  senderUsername: users.username,
  senderAvatar: users.avatarUrl,
};

/** Flatten a {message, sender...} join row into the legacy hydrate shape */
export function flattenMessageRow(r: {
  message: typeof messages.$inferSelect;
  senderName: string | null;
  senderUsername: string | null;
  senderAvatar: string | null;
}): MessageRow {
  return {
    ...r.message,
    senderName: r.senderName || 'Unknown',
    senderUsername: r.senderUsername || 'unknown',
    senderAvatar: r.senderAvatar ?? null,
  };
}

async function attachmentsForMessages(ids: string[]): Promise<Map<string, Attachment[]>> {
  const map = new Map<string, Attachment[]>();
  if (ids.length === 0) return map;
  const rows = await getDb()
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, ids))
    .orderBy(asc(attachments.createdAt));
  for (const row of rows) {
    const key = row.messageId || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      id: row.id,
      messageId: row.messageId,
      fileName: row.fileName,
      fileType: row.fileType as Attachment['fileType'],
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      url: row.url,
      width: row.width ?? null,
      height: row.height ?? null,
      createdAt: row.createdAt,
    });
  }
  return map;
}

async function reactionsForMessages(
  ids: string[],
  currentUserId: string,
): Promise<Map<string, MessageReactionSummary[]>> {
  const map = new Map<string, MessageReactionSummary[]>();
  if (ids.length === 0) return map;
  const rows = await getDb()
    .select({ reaction: messageReactions, displayName: users.displayName, username: users.username })
    .from(messageReactions)
    .innerJoin(users, eq(users.id, messageReactions.userId))
    .where(inArray(messageReactions.messageId, ids))
    .orderBy(asc(messageReactions.createdAt));

  const byMessage = new Map<string, Map<string, MessageReactionSummary>>();
  for (const row of rows) {
    const mid = row.reaction.messageId;
    if (!byMessage.has(mid)) byMessage.set(mid, new Map());
    const byEmoji = byMessage.get(mid)!;
    if (!byEmoji.has(row.reaction.emoji)) {
      byEmoji.set(row.reaction.emoji, {
        emoji: row.reaction.emoji,
        count: 0,
        userIds: [],
        users: [],
        reactedByMe: false,
      });
    }
    const summary = byEmoji.get(row.reaction.emoji)!;
    summary.count += 1;
    summary.userIds.push(row.reaction.userId);
    summary.users.push({ id: row.reaction.userId, displayName: row.displayName, username: row.username });
    if (row.reaction.userId === currentUserId) summary.reactedByMe = true;
  }
  for (const [mid, byEmoji] of byMessage) {
    map.set(mid, Array.from(byEmoji.values()));
  }
  return map;
}

async function readByForMessages(ids: string[]): Promise<Map<string, ReadReceiptUser[]>> {
  const map = new Map<string, ReadReceiptUser[]>();
  if (ids.length === 0) return map;
  const rows = await getDb()
    .select({
      messageId: readReceipts.messageId,
      userId: readReceipts.userId,
      readAt: readReceipts.readAt,
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(readReceipts)
    .innerJoin(users, eq(users.id, readReceipts.userId))
    .where(inArray(readReceipts.messageId, ids))
    .orderBy(asc(readReceipts.readAt));
  for (const row of rows) {
    if (!map.has(row.messageId)) map.set(row.messageId, []);
    map.get(row.messageId)!.push({
      userId: row.userId,
      displayName: row.displayName,
      username: row.username,
      avatarUrl: row.avatarUrl,
      readAt: row.readAt,
    });
  }
  return map;
}

export async function getReplyPreview(replyToId: string | null): Promise<ReplyPreviewData | null> {
  if (!replyToId) return null;
  const db = getDb();
  const rows = await db
    .select({
      message: messages,
      senderName: users.displayName,
      senderUsername: users.username,
      attachmentId: attachments.id,
      attachmentType: attachments.fileType,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .leftJoin(attachments, eq(attachments.messageId, messages.id))
    .where(eq(messages.id, replyToId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.message.id,
    senderId: row.message.senderId,
    senderName: row.senderName,
    senderUsername: row.senderUsername,
    content: row.message.isDeleted ? '' : row.message.content,
    type: 'text',
    isDeleted: row.message.isDeleted,
    hasAttachment: Boolean(row.attachmentId),
    attachmentType: row.attachmentType || null,
  };
}

export async function hydrateMessage(row: MessageRow, currentUserId: string): Promise<Message> {
  const hydrated = await hydrateMessages([row], currentUserId);
  return hydrated[0];
}

export async function hydrateMessages(rows: MessageRow[], currentUserId: string): Promise<Message[]> {
  const ids = rows.map((r) => String(r.id));
  const [attMap, reactMap, readMap] = await Promise.all([
    attachmentsForMessages(ids),
    reactionsForMessages(ids, currentUserId),
    readByForMessages(ids),
  ]);

  // Resolve forwarded-from names in one query
  const fwIds = Array.from(new Set(rows.map((r) => r.forwardedFromId).filter(Boolean))) as string[];
  const fwNames = new Map<string, string>();
  if (fwIds.length > 0) {
    const fwRows = await getDb()
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, fwIds));
    for (const r of fwRows) fwNames.set(r.id, r.displayName);
  }

  const previews = new Map<string, ReplyPreviewData | null>();
  await Promise.all(
    Array.from(new Set(rows.map((r) => r.replyToId).filter(Boolean) as string[])).map(async (rid) => {
      previews.set(rid, await getReplyPreview(rid));
    }),
  );

  return rows.map((row) => {
    const id = String(row.id);
    const isDeleted = Boolean(row.isDeleted);
    return {
      id,
      conversationId: String(row.conversationId),
      senderId: String(row.senderId),
      senderName: String(row.senderName || 'Unknown'),
      senderUsername: String(row.senderUsername || 'unknown'),
      senderAvatar: row.senderAvatar ? String(row.senderAvatar) : null,
      content: isDeleted ? '' : String(row.content || ''),
      replyToId: row.replyToId ? String(row.replyToId) : null,
      replyTo: row.replyToId ? previews.get(row.replyToId) ?? null : null,
      forwardedFromId: row.forwardedFromId ? String(row.forwardedFromId) : null,
      forwardedFromName: row.forwardedFromId ? fwNames.get(row.forwardedFromId) || null : null,
      isEdited: Boolean(row.isEdited),
      editedAt: row.editedAt ? String(row.editedAt) : null,
      isDeleted,
      deletedAt: row.deletedAt ? String(row.deletedAt) : null,
      isPinned: Boolean(row.isPinned),
      createdAt: String(row.createdAt),
      attachments: isDeleted ? [] : attMap.get(id) || [],
      reactions: isDeleted ? [] : reactMap.get(id) || [],
      readBy: readMap.get(id) || [],
    };
  });
}

export async function getMessageRowsForConversation(
  conversationId: string,
  before: string | null,
  limit: number,
): Promise<MessageRow[]> {
  const db = getDb();
  const where = before
    ? and(eq(messages.conversationId, conversationId), sql`${messages.createdAt} < ${before}`)
    : eq(messages.conversationId, conversationId);
  const rows = await db
    .select(messageWithSenderSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(where)
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
  return rows.map(flattenMessageRow);
}

export async function getPinnedMessageRows(conversationId: string): Promise<MessageRow[]> {
  const db = getDb();
  const rows = await db
    .select(messageWithSenderSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.isPinned, true),
        eq(messages.isDeleted, false),
      ),
    )
    .orderBy(desc(messages.createdAt));
  return rows.map(flattenMessageRow);
}

export async function getMessageById(messageId: string, currentUserId: string): Promise<Message | null> {
  const db = getDb();
  const rows = await db
    .select(messageWithSenderSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!rows[0]) return null;
  return hydrateMessage(flattenMessageRow(rows[0]), currentUserId);
}

export async function getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
  const db = getDb();
  const rows = await db
    .select({ member: conversationMembers, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, conversationId));

  return rows
    .map(({ member, user }) => ({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio || '',
      statusText: user.statusText || 'Available',
      phone: user.phone || '',
      pronouns: user.pronouns || '',
      title: user.title || '',
      location: user.location || '',
      website: user.website || '',
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt,
      role: member.role as GroupRole,
      joinedAt: member.joinedAt,
    }))
    .sort((a, b) => {
      const rank = (r: GroupRole) => (r === 'owner' ? 0 : r === 'admin' ? 1 : 2);
      if (rank(a.role) !== rank(b.role)) return rank(a.role) - rank(b.role);
      return a.displayName.localeCompare(b.displayName);
    });
}

export async function getConversationForUser(
  conversationId: string,
  userId: string,
): Promise<Conversation | null> {
  const db = getDb();
  const rows = await db
    .select({ conversation: conversations, member: conversationMembers })
    .from(conversations)
    .innerJoin(
      conversationMembers,
      and(eq(conversationMembers.conversationId, conversations.id), eq(conversationMembers.userId, userId)),
    )
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const members = await getConversationMembers(conversationId);

  const lastMsgRows = await db
    .select(messageWithSenderSelect)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const lastMessage = lastMsgRows[0]
    ? (await hydrateMessages([flattenMessageRow(lastMsgRows[0])], userId))[0]
    : null;

  // Calculate unread messages count
  const baseUnread = and(
    eq(messages.conversationId, conversationId),
    ne(messages.senderId, userId),
    eq(messages.isDeleted, false),
  );
  let unreadCount = 0;
  if (row.member.lastReadAt) {
    const unreadRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(baseUnread, gt(messages.createdAt, row.member.lastReadAt)));
    unreadCount = Number(unreadRows[0]?.count || 0);
  } else {
    const unreadRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(baseUnread);
    unreadCount = Number(unreadRows[0]?.count || 0);
  }

  if (row.member.markedUnread && unreadCount === 0) {
    unreadCount = 1;
  }

  const pinnedRows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.isPinned, true),
        eq(messages.isDeleted, false),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  return {
    id: row.conversation.id,
    type: row.conversation.type as Conversation['type'],
    name: row.conversation.name,
    description: row.conversation.description || '',
    avatarUrl: row.conversation.avatarUrl,
    createdBy: row.conversation.createdBy,
    createdAt: row.conversation.createdAt,
    updatedAt: row.conversation.updatedAt,
    lastMessageAt: row.conversation.lastMessageAt,
    myRole: row.member.role as GroupRole,
    isPinned: row.member.isPinned,
    isMuted: row.member.isMuted,
    isArchived: row.member.isArchived,
    markedUnread: row.member.markedUnread,
    unreadOverride: row.member.markedUnread,
    draftText: row.member.draftText || '',
    unreadCount,
    lastReadMessageId: row.member.lastReadMessageId,
    lastReadAt: row.member.lastReadAt,
    members,
    lastMessage,
    pinnedMessageId: pinnedRows[0]?.id ?? null,
  };
}

export async function getAllConversationsForUser(userId: string): Promise<Conversation[]> {
  const db = getDb();
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationMembers,
      and(eq(conversationMembers.conversationId, conversations.id), eq(conversationMembers.userId, userId)),
    )
    .where(eq(conversationMembers.isDeleted, false))
    .orderBy(
      desc(conversationMembers.isPinned),
      desc(sql`COALESCE(${conversations.lastMessageAt}, ${conversations.updatedAt}, ${conversations.createdAt})`),
    );

  const result: Conversation[] = [];
  for (const r of rows) {
    const conv = await getConversationForUser(r.id, userId);
    if (conv) result.push(conv);
  }
  return result;
}

export async function getConversationMemberIds(conversationId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return rows.map((r) => r.userId);
}
