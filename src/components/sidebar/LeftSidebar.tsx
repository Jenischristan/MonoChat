import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Archive,
  Bell,
  Bookmark,
  Check,
  CheckCheck,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import type { AppNotification, Conversation, ConversationFilter } from '../../types/messaging';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { formatShortTimestamp, getConversationDisplay } from '../../lib/api';
import {
  useConversations,
  useNotificationActions,
  useNotifications,
  useUpdateConversationState,
} from '../../queries/hooks';
import { Avatar, Button, MonoChatLogo, Skeleton } from '../ui/DesignSystem';

const FILTERS: { id: ConversationFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'direct', label: 'Direct' },
  { id: 'groups', label: 'Groups' },
  { id: 'favourites', label: 'Pinned' },
  { id: 'archived', label: 'Archived' },
];

function matchesFilter(conv: Conversation, filter: ConversationFilter): boolean {
  switch (filter) {
    case 'unread':
      return conv.unreadCount > 0 || conv.markedUnread;
    case 'direct':
      return conv.type === 'direct';
    case 'groups':
      return conv.type === 'group';
    case 'favourites':
      return conv.isPinned;
    case 'archived':
      return conv.isArchived;
    case 'pinned':
      return conv.isPinned;
    case 'contacts':
      return conv.type === 'direct' && !conv.name;
    default:
      return true;
  }
}

function matchesSearch(conv: Conversation, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (conv.name || '').toLowerCase().includes(q) ||
    conv.members.some(
      (m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q),
    ) ||
    (conv.lastMessage?.content || '').toLowerCase().includes(q)
  );
}

function LastMessageStatus({ conv, currentUserId }: { conv: Conversation; currentUserId: string }) {
  const last = conv.lastMessage;
  if (!last || last.senderId !== currentUserId) return null;
  if (last.clientStatus === 'sending' || last.tempId) return <Check className="w-3.5 h-3.5 text-[var(--text-muted)]" />;
  const fullyRead = last.readBy.length > 0;
  return fullyRead ? (
    <CheckCheck className="w-3.5 h-3.5 text-[var(--text-primary)]" />
  ) : (
    <CheckCheck className="w-3.5 h-3.5 text-[var(--text-muted)]" />
  );
}

export function LeftSidebar({ activeConversationId }: { activeConversationId: string | null }) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user)!;
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);

  const filter = useUIStore((s) => s.filter);
  const setFilter = useUIStore((s) => s.setFilter);
  const sidebarSearch = useUIStore((s) => s.sidebarSearch);
  const setSidebarSearch = useUIStore((s) => s.setSidebarSearch);
  const openModal = useUIStore((s) => s.openModal);
  const setMobileShowChat = useUIStore((s) => s.setMobileShowChat);

  const { data: conversations = [], isLoading } = useConversations();
  const { data: notificationsData } = useNotifications();
  const notificationActions = useNotificationActions();
  const updateState = useUpdateConversationState(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [menuConvId, setMenuConvId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return conversations
      .filter((c) => (filter === 'archived' ? c.isArchived : !c.isArchived))
      .filter((c) => matchesFilter(c, filter))
      .filter((c) => matchesSearch(c, sidebarSearch));
  }, [conversations, filter, sidebarSearch]);

  const totalUnread = conversations
    .filter((c) => !c.isArchived && !c.isMuted)
    .reduce((sum, c) => sum + (c.unreadCount > 0 || c.markedUnread ? 1 : 0), 0);
  const unreadNotifications = notificationsData?.unreadCount || 0;

  const openConversation = (convId: string) => {
    navigate({ to: '/app/c/$conversationId', params: { conversationId: convId } });
    setMobileShowChat(true);
    setMenuConvId(null);
  };

  const handleContextAction = (conv: Conversation, action: 'pin' | 'mute' | 'archive' | 'unread' | 'clear' | 'delete') => {
    setMenuConvId(null);
    const patch: Record<string, unknown> = {};
    switch (action) {
      case 'pin': patch.isPinned = !conv.isPinned; break;
      case 'mute': patch.isMuted = !conv.isMuted; break;
      case 'archive': patch.isArchived = !conv.isArchived; break;
      case 'unread': patch.markedUnread = true; break;
      case 'delete': patch.isDeleted = true; break;
      case 'clear':
        if (window.confirm('Clear the full message history of this conversation?')) {
          fetch(`/api/conversations/${conv.id}/clear`, { method: 'POST' }).then(() =>
            window.location.reload(),
          );
        }
        return;
    }
    updateState.mutate(patch);
  };

  return (
    <aside className="h-full w-full flex flex-col bg-[var(--bg-surface)] border-r border-[var(--border-color)]">
      {/* Header */}
      <div className="px-3.5 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3.5">
          <button
            type="button"
            onClick={() => openModal({ kind: 'settings' })}
            className="flex items-center gap-2.5 cursor-pointer group"
            title="Open settings"
          >
            <MonoChatLogo size="md" />
            <div className="text-left">
              <p className="text-sm font-extrabold tracking-tight text-[var(--text-primary)] group-hover:opacity-80">
                MonoChat
              </p>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                v2 · bun + postgres
              </p>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNotifications((v) => !v)}
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[var(--bg-inverted)] text-[var(--text-inverted)] text-[9px] font-bold flex items-center justify-center">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </Button>

              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <div className="absolute right-0 top-9 z-50 w-80 max-h-96 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg shadow-[var(--shadow-elevated)] fade-in-up">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-surface)]">
                      <p className="text-xs font-bold">Notifications</p>
                      <div className="flex gap-1">
                        {unreadNotifications > 0 && (
                          <Button variant="ghost" size="xs" onClick={() => notificationActions.markAllRead.mutate()}>
                            <Check className="w-3 h-3" /> Mark all
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => notificationActions.deleteAll.mutate()}
                          aria-label="Clear all notifications"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {(notificationsData?.notifications || []).length === 0 ? (
                      <p className="px-3 py-8 text-xs text-[var(--text-muted)] text-center">
                        Nothing here yet. You are all caught up.
                      </p>
                    ) : (
                      (notificationsData?.notifications || []).map((n: AppNotification) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (!n.isRead) notificationActions.markRead.mutate(n.id);
                            setShowNotifications(false);
                            if (n.conversationId) openConversation(n.conversationId);
                          }}
                          className={`w-full text-left px-3 py-2.5 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${
                            n.isRead ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[var(--text-primary)] truncate">{n.title}</p>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">{n.body}</p>
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                              {formatShortTimestamp(n.createdAt)}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => openModal({ kind: 'settings' })} aria-label="Settings">
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="primary" size="icon" onClick={() => openModal({ kind: 'new-chat' })} aria-label="New conversation">
              <MessageSquarePlus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2.5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
          <input
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md focus:border-[var(--border-focus)] focus:bg-[var(--bg-surface)] outline-none transition-colors placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
            aria-label="Search conversations"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-6.5 px-2.5 text-[10px] font-bold uppercase tracking-wider rounded border shrink-0 transition-colors cursor-pointer ${
                filter === f.id
                  ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] border-transparent'
                  : 'border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {f.label}
              {f.id === 'unread' && totalUnread > 0 && (
                <span className="ml-1 opacity-70">{totalUnread}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto" role="list" aria-label="Conversations">
        {isLoading ? (
          <div className="space-y-2 px-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <Users className="w-8 h-8 text-[var(--text-muted)] opacity-50 mb-3" />
            <p className="text-xs font-semibold text-[var(--text-secondary)]">No conversations found</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Start a direct chat or create a group.
            </p>
            <Button size="sm" className="mt-4" onClick={() => openModal({ kind: 'new-chat' })}>
              <MessageSquarePlus className="w-3.5 h-3.5" /> New conversation
            </Button>
          </div>
        ) : (
          filtered.map((conv) => {
            const display = getConversationDisplay(conv, currentUser.id, onlineUserIds, currentUser);
            const isActive = conv.id === activeConversationId;
            const typing = useChatStore
              .getState()
              .typingByConv[conv.id]?.filter((t) => t.userId !== currentUser.id);

            return (
              <div key={conv.id} className="relative px-2" role="listitem">
                <button
                  type="button"
                  onClick={() => openConversation(conv.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuConvId(conv.id);
                  }}
                  className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-md transition-colors text-left cursor-pointer ${
                    isActive
                      ? 'bg-[var(--bg-active)]'
                      : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Avatar
                    name={display.title}
                    avatarUrl={display.avatarUrl}
                    isOnline={display.isOnline}
                    isSavedMessages={display.isSavedMessages}
                    showPresence={!display.isSavedMessages}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-bold truncate ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                        {display.title}
                      </p>
                      <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
                        {conv.isPinned && <Pin className="w-3 h-3" />}
                        {conv.isMuted && <Bell className="w-3 h-3 opacity-50" />}
                        {conv.lastMessage?.createdAt && formatShortTimestamp(conv.lastMessage.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[11px] text-[var(--text-muted)] truncate">
                        {typing && typing.length > 0 ? (
                          <span className="flex items-center gap-1">
                            {typing[0].displayName.split(' ')[0]} is typing
                            <span className="flex gap-0.5">
                              <span className="typing-dot-1 w-1 h-1 rounded-full bg-[var(--text-secondary)] inline-block" />
                              <span className="typing-dot-2 w-1 h-1 rounded-full bg-[var(--text-secondary)] inline-block" />
                              <span className="typing-dot-3 w-1 h-1 rounded-full bg-[var(--text-secondary)] inline-block" />
                            </span>
                          </span>
                        ) : conv.lastMessage ? (
                          <>
                            {conv.lastMessage.isDeleted
                              ? 'Message deleted'
                              : conv.lastMessage.content || (conv.lastMessage.attachments.length > 0 ? '📎 Attachment' : '')}
                          </>
                        ) : (
                          display.subtitle
                        )}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <LastMessageStatus conv={conv} currentUserId={currentUser.id} />
                        {(conv.unreadCount > 0 || conv.markedUnread) && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--bg-inverted)] text-[var(--text-inverted)] text-[10px] font-bold flex items-center justify-center">
                            {conv.unreadCount > 0 ? conv.unreadCount : '•'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Context menu trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuConvId(menuConvId === conv.id ? null : conv.id);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 focus:opacity-100 data-[open=true]:opacity-100 p-1 rounded hover:bg-[var(--bg-active)]"
                  style={{ opacity: menuConvId === conv.id ? 1 : undefined }}
                  data-open={menuConvId === conv.id}
                  aria-label="Conversation options"
                >
                  <MoreHorizontal className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>

                {menuConvId === conv.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuConvId(null)} />
                    <div
                      ref={menuRef}
                      className="absolute right-3 top-3 z-50 w-48 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md shadow-[var(--shadow-elevated)] py-1 fade-in-up"
                    >
                      {[
                        { id: 'pin', icon: Pin, label: conv.isPinned ? 'Unpin' : 'Pin' },
                        { id: 'mute', icon: Bell, label: conv.isMuted ? 'Unmute' : 'Mute' },
                        { id: 'unread', icon: Check, label: 'Mark as unread' },
                        { id: 'archive', icon: Archive, label: conv.isArchived ? 'Unarchive' : 'Archive' },
                        { id: 'clear', icon: Trash2, label: 'Clear history' },
                        { id: 'delete', icon: Trash2, label: 'Delete conversation' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleContextAction(conv, item.id as any)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          <item.icon className="w-3.5 h-3.5" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Current user footer */}
      <div className="p-2.5 border-t border-[var(--border-color)] shrink-0">
        <button
          type="button"
          onClick={() => openModal({ kind: 'settings', initialTab: 'profile' })}
          className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
        >
          <Avatar
            name={currentUser.displayName}
            avatarUrl={currentUser.avatarUrl}
            isOnline
            showPresence={currentUser.settings?.showOnlineStatus !== false}
            size="sm"
          />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-bold text-[var(--text-primary)] truncate">{currentUser.displayName}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">@{currentUser.username}</p>
          </div>
          <Bookmark className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        </button>
      </div>
    </aside>
  );
}
