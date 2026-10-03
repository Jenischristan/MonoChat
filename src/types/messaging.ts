export type ThemeMode = 'light' | 'dark' | 'system';

export type GroupRole = 'owner' | 'admin' | 'member';

export type ConversationType = 'direct' | 'group';

export type ConversationFilter = 'all' | 'unread' | 'favourites' | 'direct' | 'groups' | 'pinned' | 'archived' | 'contacts';

export type MessageFontSize = 'small' | 'medium' | 'large';

export interface UserSettings {
  theme: ThemeMode;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  showReadReceipts: boolean;
  showOnlineStatus: boolean;
  showTypingIndicator: boolean;
  enterToSend?: boolean;
  messagePreview?: boolean;
  compactMode?: boolean;
  fontSize?: MessageFontSize;
  allowDirectMessages?: 'everyone' | 'contacts';
  chatWallpaper?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  statusText: string;
  phone?: string;
  pronouns?: string;
  title?: string;
  location?: string;
  website?: string;
  isOnline: boolean;
  lastSeenAt: string;
  createdAt: string;
  settings?: UserSettings;
}

export interface UserReport {
  id: string;
  reporterId: string;
  targetType: 'user' | 'conversation' | 'message';
  targetId: string;
  targetUserId: string | null;
  targetName: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

export interface ConversationMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  statusText: string;
  phone?: string;
  pronouns?: string;
  title?: string;
  location?: string;
  website?: string;
  isOnline: boolean;
  lastSeenAt: string;
  role: GroupRole;
  joinedAt: string;
}

export interface Attachment {
  id: string;
  messageId: string | null;
  fileName: string;
  fileType: 'image' | 'document' | 'file' | 'audio';
  mimeType: string;
  fileSize: number;
  url: string;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
  users: { id: string; displayName: string; username: string }[];
  reactedByMe: boolean;
}

export interface ReplyPreviewData {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  content: string;
  type?: string;
  isDeleted?: boolean;
  hasAttachment: boolean;
  attachmentType?: string | null;
}

export interface ReadReceiptUser {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  readAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string | null;
  content: string;
  type?: string;
  replyToId: string | null;
  replyTo: ReplyPreviewData | null;
  forwardedFromId?: string | null;
  forwardedFromName?: string | null;
  isEdited: boolean;
  editedAt?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt?: string;
  attachments: Attachment[];
  reactions: MessageReactionSummary[];
  readBy: ReadReceiptUser[];
  // Client optimistic states
  clientStatus?: 'sending' | 'sent' | 'failed';
  tempId?: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  description: string;
  avatarUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  // User-specific membership state
  myRole: GroupRole;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  markedUnread: boolean;
  unreadOverride?: boolean;
  draftText: string;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  // Hydrated participants & last message
  members: ConversationMember[];
  lastMessage: Message | null;
  pinnedMessageId?: string | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'message' | 'reply' | 'reaction' | 'group_invite' | 'mention';
  title: string;
  body: string;
  conversationId: string | null;
  messageId: string | null;
  actorId: string | null;
  actorName?: string | null;
  actorAvatar?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface SearchResults {
  users: User[];
  conversations: Conversation[];
  messages: {
    id: string;
    conversationId: string;
    conversationName: string;
    conversationType: ConversationType;
    senderId: string;
    senderName: string;
    senderUsername: string;
    senderAvatar: string | null;
    content: string;
    createdAt: string;
  }[];
}

export type RealtimeEvent =
  | { type: 'init'; onlineUserIds: string[] }
  | { type: 'presence:update'; userId: string; isOnline: boolean; lastSeenAt: string }
  | { type: 'typing:update'; conversationId: string; userId: string; displayName: string; isTyping: boolean }
  | { type: 'message:new'; conversationId: string; message: Message; tempId?: string }
  | { type: 'message:edited'; conversationId: string; message: Message }
  | { type: 'message:updated'; conversationId: string; message: Message }
  | { type: 'message:deleted'; conversationId: string; messageId?: string; deletedAt?: string; message?: Message }
  | { type: 'message:reaction'; conversationId: string; messageId?: string; reactions?: MessageReactionSummary[]; message?: Message }
  | { type: 'message:pinned'; conversationId: string; messageId: string; isPinned: boolean }
  | { type: 'conversation:read'; conversationId: string; userId: string; displayName: string; username: string; avatarUrl: string | null; lastReadMessageId: string; readAt: string }
  | { type: 'conversation:created'; conversation: Conversation }
  | { type: 'conversation:updated'; conversation: Conversation }
  | { type: 'conversation:cleared'; conversationId: string }
  | { type: 'group:member_removed'; conversationId: string; userId: string }
  | { type: 'notification:new'; notification: AppNotification };
