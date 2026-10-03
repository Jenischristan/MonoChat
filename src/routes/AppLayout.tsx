import React, { useEffect } from 'react';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { Bookmark, Lock, MessageSquarePlus, Search, Send, Users, X } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';
import { useConversations, useMarkRead } from '../queries/hooks';
import { useRealtimeBridge } from '../queries/realtime';
import { useChatStore } from '../stores/chat';
import { getChatBackgroundOption } from '../lib/wallpapers';
import { LeftSidebar } from '../components/sidebar/LeftSidebar';
import { ChatHeader } from '../components/chat/ChatHeader';
import { MessageList } from '../components/chat/MessageList';
import { MessageComposer } from '../components/chat/MessageComposer';
import { RightInfoPanel } from '../components/panel/RightInfoPanel';
import { ModalHost } from '../components/modals/Modals';
import { ToastContainer, Button, MonoChatLogo } from '../components/ui/DesignSystem';

function getChatBackgroundStyle(chatBackground: string): React.CSSProperties {
  const bg = getChatBackgroundOption(chatBackground);
  if (bg.imageUrl) {
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,${bg.overlayOpacity ?? 0.5}), rgba(0,0,0,${bg.overlayOpacity ?? 0.5})), url(${bg.imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { backgroundColor: bg.backgroundColor };
}

export function AppLayout() {
  const themeMode = useUIStore((s) => s.themeMode);
  const mobileShowChat = useUIStore((s) => s.mobileShowChat);

  useRealtimeBridge(null);

  // Apply theme class
  useEffect(() => {
    const resolved = themeMode === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
      : themeMode;
    document.documentElement.classList.toggle('light', resolved === 'light');
  }, [themeMode]);

  return (
    <div className="h-full w-full flex bg-[var(--bg-canvas)]">
      {/* Sidebar — always visible on md+, toggled on mobile */}
      <div
        className={`h-full w-full md:w-[320px] lg:w-[340px] shrink-0 ${
          mobileShowChat ? 'hidden md:block' : 'block'
        }`}
      >
        <LeftSidebar activeConversationId={null} />
      </div>

      {/* Content area */}
      <div className={`h-full flex-1 min-w-0 ${mobileShowChat ? 'flex' : 'hidden md:flex'}`}>
        <Outlet />
      </div>

      {/* Overlays */}
      <ModalHost />
      <ToastContainer />
    </div>
  );
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const currentUser = useAuthStore((s) => s.user)!;
  const isInfoPanelOpen = useUIStore((s) => s.isInfoPanelOpen);
  const chatBackground = useUIStore((s) => s.chatBackground);
  const navigate = useNavigate();
  const { data: conversations = [], isLoading } = useConversations();
  const conversation = conversations.find((c) => c.id === conversationId);
  const markRead = useMarkRead();
  const typing = useChatStore((s) => s.typingByConv[conversationId]?.filter((t) => t.userId !== currentUser.id));

  useRealtimeBridge(conversationId);

  // Mark read on open
  useEffect(() => {
    if (conversation && (conversation.unreadCount > 0 || conversation.markedUnread)) {
      markRead.mutate(conversation.id);
    }
  }, [conversation?.id, conversation?.unreadCount, conversation?.markedUnread]);

  // Mobile: show chat on open
  useEffect(() => {
    useUIStore.getState().setMobileShowChat(true);
  }, [conversationId]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="flex gap-1.5">
          <span className="typing-dot-1 w-2 h-2 rounded-full bg-[var(--text-muted)]" />
          <span className="typing-dot-2 w-2 h-2 rounded-full bg-[var(--text-muted)]" />
          <span className="typing-dot-3 w-2 h-2 rounded-full bg-[var(--text-muted)]" />
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center px-6">
        <Lock className="w-8 h-8 text-[var(--text-muted)] opacity-50 mb-3" />
        <p className="text-sm font-bold text-[var(--text-secondary)]">Conversation unavailable</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">It may have been deleted, or you were removed.</p>
        <Button className="mt-4" onClick={() => navigate({ to: '/app' })}>
          Back to conversations
        </Button>
      </div>
    );
  }

  const showPanelDesktop = isInfoPanelOpen;

  return (
    <div className="h-full w-full flex min-w-0">
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <ChatHeader conversation={conversation} />

        {/* In-chat search strip */}
        {useChatStore.getState().inChatSearchOpen && (
          <InChatSearchStrip conversationId={conversation.id} />
        )}

        {typing && typing.length > 0 && (
          <div className="px-4 py-1 text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)] border-b border-[var(--border-color)] flex items-center gap-1.5">
            <span className="flex gap-0.5">
              <span className="typing-dot-1 w-1 h-1 rounded-full bg-[var(--text-secondary)] inline-block" />
              <span className="typing-dot-2 w-1 h-1 rounded-full bg-[var(--text-secondary)] inline-block" />
              <span className="typing-dot-3 w-1 h-1 rounded-full bg-[var(--text-secondary)] inline-block" />
            </span>
            {typing.map((t) => t.displayName.split(' ')[0]).join(', ')}{' '}
            {typing.length === 1 ? 'is' : 'are'} typing…
          </div>
        )}

        <div
          className="flex-1 flex flex-col min-h-0"
          style={getChatBackgroundStyle(chatBackground)}
        >
          <MessageList conversation={conversation} />
          <MessageComposer conversation={conversation} />
        </div>
      </div>

      {/* Info panel — desktop */}
      {showPanelDesktop && (
        <div className="hidden lg:block w-[300px] xl:w-[340px] shrink-0">
          <RightInfoPanel conversation={conversation} />
        </div>
      )}

      {/* Info panel — mobile slide-over */}
      {showPanelDesktop && (
        <div className="lg:hidden fixed inset-0 z-40 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => useUIStore.getState().toggleInfoPanel()}
          />
          <div className="relative w-[320px] max-w-full h-full shadow-[var(--shadow-elevated)]">
            <RightInfoPanel conversation={conversation} onClose={() => useUIStore.getState().toggleInfoPanel()} />
          </div>
        </div>
      )}
    </div>
  );
}

function InChatSearchStrip({ conversationId }: { conversationId: string }) {
  const query = useChatStore((s) => s.inChatSearchQuery);
  const setQuery = useChatStore((s) => s.setInChatSearchQuery);
  const setOpen = useChatStore((s) => s.setInChatSearchOpen);
  const setHighlighted = useChatStore((s) => s.setHighlightedMessageId);

  return (
    <div className="h-12 shrink-0 flex items-center gap-2 px-3 bg-[var(--bg-surface)] border-b border-[var(--border-color)]">
      <Search className="w-4 h-4 text-[var(--text-muted)]" />
      <input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim()) {
            // naive highlight: first match is handled by MessageList scroll
            setHighlighted(null);
            window.dispatchEvent(
              new CustomEvent('monochat:inchat-search', { detail: { conversationId, query: e.target.value } }),
            );
          }
        }}
        placeholder="Search in this conversation…"
        className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
      />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setQuery('');
          setHighlighted(null);
        }}
        className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer"
        aria-label="Close search"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function EmptyChatState() {
  const openModal = useUIStore((s) => s.openModal);
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-[var(--bg-canvas)] text-center px-6">
      <MonoChatLogo size="xl" className="mb-4 opacity-80" />
      <p className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
        Welcome to MonoChat
      </p>
      <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-xs leading-relaxed">
        Select a conversation on the left, start a direct chat, or create a group. Everything stays
        strictly monochrome.
      </p>
      <div className="flex items-center gap-2 mt-5">
        <Button onClick={() => openModal({ kind: 'new-chat', initialMode: 'direct' })}>
          <MessageSquarePlus className="w-3.5 h-3.5" /> New chat
        </Button>
        <Button variant="outline" onClick={() => openModal({ kind: 'new-chat', initialMode: 'group' })}>
          <Users className="w-3.5 h-3.5" /> New group
        </Button>
      </div>
    </div>
  );
}
