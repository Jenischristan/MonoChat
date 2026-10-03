import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Archive,
  Bell,
  Check,
  CheckCheck,
  Command,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  Trash2,
  Users,
  Volume2,
  VolumeX,
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
import { Avatar, Button, Kbd, MonoChatLogo, Skeleton } from '../ui/DesignSystem';

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
  const pushToast = useUIStore((s) => s.pushToast);

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
        fetch(`/api/conversations/${conv.id}/clear`, { method: 'POST' }).then(() => {
          pushToast({ kind: 'info', title: 'History cleared', body: 'Conversation history was reset.' });
          window.location.reload();
        });
        return;
    }
    updateState.mutate(patch);
  };

  return (
    <aside className="h-full w-full flex flex-col bg-[var(--bg-surface)] border-r border-[var(--border-color)]">
      {/* Header */}
      <div className="p-4 shrink-0 border-b border-[var(--border-subtle)] space-y-3.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => openModal({ kind: 'settings' })}
            className="flex items-center gap-3 cursor-pointer group text-left"
            title="Open workspace settings"
          >
            <MonoChatLogo size="sm" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold tracking-tight text-[var(--text-primary)] group-hover:opacity-85 transition-opacity">
                  MonoChat
                </p>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Connected" />
              </div>
              <p className="text-[10px] font-medium tracking-wide text-[var(--text-muted)]">
                Workspace
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5">
            {/* Notifications Button & Dropdown */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNotifications((v) => !v)}
                aria-label="Notifications"
                className="relative rounded-xl h-8.5 w-8.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white ring-2 ring-[var(--bg-surface)] shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                )}
              </Button>

              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <div className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-elevated)] fade-in-up">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-surface)]/95 backdrop-blur-md">
                      <p className="text-xs font-bold text-[var(--text-primary)]">Notifications</p>
                      <div className="flex gap-1">
                        {unreadNotifications > 0 && (
                          <Button variant="ghost" size="xs" onClick={() => notificationActions.markAllRead.mutate()}>
                            <Check className="w-3 h-3" /> Mark all read
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => notificationActions.deleteAll.mutate()}
                          aria-label="Clear all notifications"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {(notificationsData?.notifications || []).length === 0 ? (
                      <p className="px-4 py-8 text-xs text-[var(--text-muted)] text-center">
                        All caught up. No new notifications.
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
                          className={`w-full text-left px-4 py-3 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${
                            n.isRead ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[var(--text-primary)] truncate">{n.title}</p>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">{n.body}</p>
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-mono">
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

            <Button
              variant="primary"
              size="icon"
              onClick={() => openModal({ kind: 'new-chat' })}
              title="New message or group"
              aria-label="New conversation"
              className="rounded-xl h-8.5 w-8.5 shadow-sm"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Search Input with ⌘K Badge */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
          <input
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full h-9 pl-9 pr-14 text-xs bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl focus:border-[var(--border-focus)] focus:bg-[var(--bg-surface)] outline-none transition-colors placeholder:text-[var(--text-muted)] text-[var(--text-primary)] shadow-xs"
            aria-label="Search conversations"
          />
          <button
            type="button"
            onClick={() => openModal({ kind: 'search' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
            title="Global search shortcut"
          >
            <Kbd>⌘K</Kbd>
          </button>
        </div>

        {/* Segmented Filter Controls */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-7 px-2.5 text-xs font-medium rounded-lg shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                filter === f.id
                  ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] font-bold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <span>{f.label}</span>
              {f.id === 'unread' && totalUnread > 0 && (
                <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                  filter === 'unread' ? 'bg-black text-white' : 'bg-white text-black'
                }`}>
                  {totalUnread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1" role="list" aria-label="Conversations">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <Users className="w-8 h-8 text-[var(--text-muted)] opacity-30 mb-3" />
            <p className="text-xs font-semibold text-[var(--text-secondary)]">No conversations</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-[200px]">
              Start a new direct chat or create a team group.
            </p>
            <Button size="sm" className="mt-4" onClick={() => openModal({ kind: 'new-chat' })}>
              <MessageSquarePlus className="w-3.5 h-3.5" /> Start chat
            </Button>
          </div>
        ) : (
          filtered.map((conv) => {
            const display = getConversationDisplay(conv, currentUser.id, onlineUserIds, currentUser);
            const isActive = activeConversationId === conv.id;
            const hasUnread = conv.unreadCount > 0 || conv.markedUnread;

            return (
              <div key={conv.id} className="relative group">
                <button
                  type="button"
                  onClick={() => openConversation(conv.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left cursor-pointer ${
                    isActive
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border-strong)]'
                      : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
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
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {conv.isPinned && <Pin className="w-3 h-3 text-[var(--text-muted)] shrink-0" />}
                        <p className={`text-xs truncate ${hasUnread ? 'font-bold text-[var(--text-primary)]' : 'font-semibold'}`}>
                          {display.title}
                        </p>
                      </div>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-mono">
                          {formatShortTimestamp(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <LastMessageStatus conv={conv} currentUserId={currentUser.id} />
                        <p className={`text-xs truncate ${hasUnread ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                          {conv.draftText ? (
                            <span className="text-[var(--text-primary)] font-medium">Draft: {conv.draftText}</span>
                          ) : (
                            conv.lastMessage?.content || (conv.lastMessage?.attachments?.length ? '📎 Attachment' : 'No messages yet')
                          )}
                        </p>
                      </div>

                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--text-primary)] text-[var(--bg-canvas)] text-[10px] font-bold flex items-center justify-center shrink-0 shadow-xs">
                          {conv.unreadCount > 99 ? '99+' : conv.unreadCount || '!'}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Context Options Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuConvId(menuConvId === conv.id ? null : conv.id);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg hover:bg-[var(--bg-active)] transition-opacity cursor-pointer"
                  style={{ opacity: menuConvId === conv.id ? 1 : undefined }}
                  aria-label="Conversation options"
                >
                  <MoreHorizontal className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                </button>

                {menuConvId === conv.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuConvId(null)} />
                    <div
                      ref={menuRef}
                      className="absolute right-3 top-4 z-50 w-44 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-elevated)] py-1.5 fade-in-up backdrop-blur-xl"
                    >
                      {[
                        { id: 'pin', icon: Pin, label: conv.isPinned ? 'Unpin' : 'Pin' },
                        { id: 'mute', icon: Bell, label: conv.isMuted ? 'Unmute' : 'Mute' },
                        { id: 'unread', icon: Check, label: 'Mark as unread' },
                        { id: 'archive', icon: Archive, label: conv.isArchived ? 'Unarchive' : 'Archive' },
                        { id: 'clear', icon: Trash2, label: 'Clear history' },
                        { id: 'delete', icon: Trash2, label: 'Delete chat' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleContextAction(conv, item.id as any)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          <item.icon className="w-3.5 h-3.5" />
                          <span>{item.label}</span>
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

      {/* User Footer */}
      <div className="p-3 border-t border-[var(--border-color)] shrink-0 bg-[var(--bg-surface)] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => openModal({ kind: 'settings', initialTab: 'profile' })}
          className="flex-1 flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-left group min-w-0"
        >
          <Avatar
            name={currentUser.displayName}
            avatarUrl={currentUser.avatarUrl}
            isOnline
            showPresence={currentUser.settings?.showOnlineStatus !== false}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:opacity-90">{currentUser.displayName}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">@{currentUser.username}</p>
          </div>
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => openModal({ kind: 'settings' })}
          className="rounded-xl h-8.5 w-8.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          title="Settings (⌘,)"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </aside>
  );
}
