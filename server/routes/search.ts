import { Hono } from 'hono';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { attachments, conversations, conversationMembers, messages, users } from '../db/schema';
import { hydrateUser, requireAuth, sanitizeText, type AppEnv } from '../lib/auth';
import { getConversationForUser } from '../lib/hydrate';
import { ensureSavedMessagesConversation } from './conversations';
import type { Conversation } from '../../src/types/messaging';

export const searchApp = new Hono<AppEnv>();
searchApp.use('*', requireAuth);

// GET /api/search?q=&conversationId=
searchApp.get('/', async (c) => {
  const userId = c.get('user').id;
  const rawQ = typeof c.req.query('q') === 'string' ? c.req.query('q') : '';
  const q = sanitizeText(rawQ, 100).toLowerCase();
  const db = getDb();

  if (!q || q.trim().length === 0) {
    return c.json({ users: [], conversations: [], messages: [], files: [] });
  }

  const cleanLike = `%${q.replace(/^@+/, '').trim()}%`;
  const rawLike = `%${q}%`;

  // Resolve special conversation scopes ("saved" / "notes" / "bookmarks")
  const rawConvQuery = c.req.query('conversationId');
  const rawConvId = typeof rawConvQuery === 'string' ? rawConvQuery.trim() : '';
  const savedConvId = await ensureSavedMessagesConversation(userId);
  const conversationId = ['saved', 'notes', 'bookmarks'].includes(rawConvId)
    ? savedConvId
    : rawConvId || null;

  // Scoped conversation search → only messages within the conversation
  if (conversationId) {
    const access = await db
      .select({ id: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
      .limit(1);
    if (!access[0]) {
      return c.json({ users: [], conversations: [], messages: [], files: [] });
    }

    const convRow = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    const isSaved = conversationId === savedConvId || convRow[0]?.name === 'Saved Messages';

    const msgRows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        senderName: users.displayName,
        senderUsername: users.username,
        senderAvatar: users.avatarUrl,
        content: messages.content,
        createdAt: messages.createdAt,
        isDeleted: messages.isDeleted,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.isDeleted, false),
          sql`(
            LOWER(${messages.content}) LIKE ${rawLike}
            OR EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = ${messages.id} AND LOWER(a.file_name) LIKE ${cleanLike})
            OR EXISTS (SELECT 1 FROM users fu WHERE fu.id = ${messages.forwardedFromId} AND (LOWER(fu.display_name) LIKE ${cleanLike} OR LOWER(fu.username) LIKE ${cleanLike}))
          )`,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(50);

    return c.json({
      users: [],
      conversations: [],
      messages: msgRows.map((r) => ({
        id: r.id,
        conversationId: r.conversationId,
        conversationName: isSaved ? 'Saved Messages' : r.senderName,
        conversationType: convRow[0]?.type || 'direct',
        senderId: r.senderId,
        senderName: r.senderName,
        senderUsername: r.senderUsername,
        senderAvatar: r.senderAvatar,
        content: r.content,
        createdAt: r.createdAt,
      })),
      files: [],
    });
  }

  // Global search: users + conversations + messages + files
  // 1. Matching users (excluding the searching user) — @prefix stripped + raw match
  const userRows = await db
    .select()
    .from(users)
    .where(
      sql`(
        LOWER(${users.username}) LIKE ${cleanLike}
        OR LOWER(${users.username}) LIKE ${rawLike}
        OR LOWER(${users.displayName}) LIKE ${rawLike}
        OR LOWER(${users.bio}) LIKE ${rawLike}
        OR LOWER(${users.title}) LIKE ${rawLike}
        OR LOWER(${users.email}) LIKE ${rawLike}
      ) AND ${users.id} != ${userId}`,
    )
    .orderBy(desc(users.isOnline))
    .limit(20);

  const myConvRows = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.isDeleted, false)));
  const myConvIds = myConvRows.map((r) => r.conversationId);

  // Load all conversations + build name lookup map (mirrors original semantics:
  // single-member direct conversations are the user's "Saved Messages")
  let matchingConvs: Conversation[] = [];
  const convNameMap = new Map<string, string>();
  if (myConvRows.length > 0) {
    const allConvs: Conversation[] = [];
    for (const row of myConvRows.slice(0, 200)) {
      const conv = await getConversationForUser(row.conversationId, userId);
      if (conv) allConvs.push(conv);
    }
    for (const conv of allConvs) {
      if (conv.type === 'direct' && conv.members.length === 1) {
        convNameMap.set(conv.id, 'Saved Messages');
      } else if (conv.type === 'group') {
        convNameMap.set(conv.id, conv.name || 'Group');
      } else {
        const other = conv.members.find((m) => m.userId !== userId);
        convNameMap.set(conv.id, other ? other.displayName : conv.name || 'Direct Chat');
      }
    }
    matchingConvs = allConvs.filter((conv) => {
      const isSaved = conv.type === 'direct' && conv.members.length === 1;

      const matchesNameDesc =
        (conv.name && conv.name.toLowerCase().includes(q)) ||
        (conv.description && conv.description.toLowerCase().includes(q)) ||
        (conv.lastMessage?.content && conv.lastMessage.content.toLowerCase().includes(q));

      if (isSaved) {
        return (
          ['saved messages', 'saved notes', 'notes', 'bookmarks', 'saved', 'links', 'personal'].some(
            (k) => k.includes(q),
          ) || matchesNameDesc
        );
      }

      if (conv.type === 'group') return matchesNameDesc;

      const other = conv.members.find((m) => m.userId !== userId);
      if (!other) {
        return Boolean(matchesNameDesc);
      }
      return (
        other.displayName.toLowerCase().includes(q) ||
        other.username.toLowerCase().includes(q) ||
        (other.bio && other.bio.toLowerCase().includes(q)) ||
        (conv.lastMessage?.content && conv.lastMessage.content.toLowerCase().includes(q))
      );
    }).slice(0, 10);
  }

  let messageResults: any[] = [];
  if (myConvIds.length > 0) {
    const msgRows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        conversationType: conversations.type,
        groupName: conversations.name,
        senderId: messages.senderId,
        senderName: users.displayName,
        senderUsername: users.username,
        senderAvatar: users.avatarUrl,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          inArray(messages.conversationId, myConvIds),
          eq(messages.isDeleted, false),
          sql`(
            LOWER(${messages.content}) LIKE ${cleanLike}
            OR EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = ${messages.id} AND LOWER(a.file_name) LIKE ${cleanLike})
            OR EXISTS (SELECT 1 FROM users fu WHERE fu.id = ${messages.forwardedFromId} AND (LOWER(fu.display_name) LIKE ${cleanLike} OR LOWER(fu.username) LIKE ${cleanLike}))
          )`,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(40);

    messageResults = msgRows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      conversationName:
        convNameMap.get(r.conversationId) ||
        (r.conversationType === 'group' ? r.groupName || 'Group' : r.senderName),
      conversationType: r.conversationType,
      senderId: r.senderId,
      senderName: r.senderName,
      senderUsername: r.senderUsername,
      senderAvatar: r.senderAvatar,
      content: r.content,
      createdAt: r.createdAt,
    }));
  }

  const fileRows =
    myConvIds.length > 0
      ? await db
          .select({
            id: attachments.id,
            messageId: attachments.messageId,
            uploaderId: attachments.uploaderId,
            fileName: attachments.fileName,
            fileType: attachments.fileType,
            mimeType: attachments.mimeType,
            fileSize: attachments.fileSize,
            url: attachments.url,
            createdAt: attachments.createdAt,
            conversationId: messages.conversationId,
          })
          .from(attachments)
          .innerJoin(messages, eq(messages.id, attachments.messageId))
          .where(
            and(
              inArray(messages.conversationId, myConvIds),
              eq(messages.isDeleted, false),
              sql`LOWER(${attachments.fileName}) LIKE ${cleanLike}`,
            ),
          )
          .orderBy(desc(attachments.createdAt))
          .limit(30)
      : [];

  return c.json({
    users: userRows.map((r) => hydrateUser(r)),
    conversations: matchingConvs,
    messages: messageResults,
    files: fileRows,
  });
});
