import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio').default('').notNull(),
    statusText: text('status_text').default('Available').notNull(),
    phone: text('phone').default('').notNull(),
    pronouns: text('pronouns').default('').notNull(),
    title: text('title').default('').notNull(),
    location: text('location').default('').notNull(),
    website: text('website').default('').notNull(),
    isOnline: boolean('is_online').default(false).notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('users_username_uq').on(table.username),
    uniqueIndex('users_email_uq').on(table.email),
    index('idx_users_display_name').on(table.displayName),
  ],
);

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').default('dark').notNull(),
  notificationsEnabled: boolean('notifications_enabled').default(true).notNull(),
  soundEnabled: boolean('sound_enabled').default(true).notNull(),
  desktopNotifications: boolean('desktop_notifications').default(false).notNull(),
  showReadReceipts: boolean('show_read_receipts').default(true).notNull(),
  showOnlineStatus: boolean('show_online_status').default(true).notNull(),
  showTypingIndicator: boolean('show_typing_indicator').default(true).notNull(),
  enterToSend: boolean('enter_to_send').default(true).notNull(),
  messagePreview: boolean('message_preview').default(true).notNull(),
  compactMode: boolean('compact_mode').default(false).notNull(),
  fontSize: text('font_size').default('medium').notNull(),
  allowDirectMessages: text('allow_direct_messages').default('everyone').notNull(),
  chatWallpaper: text('chat_wallpaper').default('solid-obsidian').notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent').default('Browser Session').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    lastActiveAt: text('last_active_at').notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_uq').on(table.token),
    index('idx_sessions_user').on(table.userId),
  ],
);

export const passwordResets = pgTable('password_resets', {
  token: text('token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    name: text('name'),
    description: text('description').default('').notNull(),
    avatarUrl: text('avatar_url'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastMessageAt: text('last_message_at'),
  },
  (table) => [index('idx_conversations_type').on(table.type)],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').default('member').notNull(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    isMuted: boolean('is_muted').default(false).notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    markedUnread: boolean('marked_unread').default(false).notNull(),
    lastReadMessageId: text('last_read_message_id'),
    lastReadAt: text('last_read_at'),
    draftText: text('draft_text').default('').notNull(),
    joinedAt: text('joined_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('idx_conv_members_user').on(table.userId, table.isDeleted, table.isArchived),
    index('idx_conv_members_conv').on(table.conversationId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').default('').notNull(),
    replyToId: text('reply_to_id').references((): any => messages.id, { onDelete: 'set null' }),
    forwardedFromId: text('forwarded_from_id').references(() => users.id, { onDelete: 'set null' }),
    isEdited: boolean('is_edited').default(false).notNull(),
    editedAt: text('edited_at'),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    deletedAt: text('deleted_at'),
    isPinned: boolean('is_pinned').default(false).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_messages_conv_created').on(table.conversationId, table.createdAt),
    index('idx_messages_sender').on(table.senderId),
  ],
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('reactions_uq').on(table.messageId, table.userId, table.emoji),
    index('idx_reactions_message').on(table.messageId),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    uploaderId: text('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    url: text('url').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_attachments_message').on(table.messageId)],
);

export const readReceipts = pgTable(
  'read_receipts',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: text('read_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    index('idx_read_receipts_conv').on(table.conversationId, table.userId),
    index('idx_read_receipts_msg').on(table.messageId),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_notifications_user').on(table.userId, table.isRead, table.createdAt)],
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] })],
);

export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetName: text('target_name').default('').notNull(),
    reason: text('reason').notNull(),
    details: text('details').default('').notNull(),
    blockUser: boolean('block_user').default(false).notNull(),
    status: text('status').default('submitted').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_reports_reporter').on(table.reporterId, table.createdAt)],
);
