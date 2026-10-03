import React, { useState } from 'react';
import { ArrowLeft, Flag, Info, PanelRight, Phone, Pin, Search, Video } from 'lucide-react';
import type { Conversation } from '../../types/messaging';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { getConversationDisplay } from '../../lib/api';
import { Avatar, Button } from '../ui/DesignSystem';

export function ChatHeader({ conversation }: { conversation: Conversation }) {
  const currentUser = useAuthStore((s) => s.user)!;
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);
  const isInfoPanelOpen = useUIStore((s) => s.isInfoPanelOpen);
  const toggleInfoPanel = useUIStore((s) => s.toggleInfoPanel);
  const openModal = useUIStore((s) => s.openModal);
  const setMobileShowChat = useUIStore((s) => s.setMobileShowChat);
  const setInChatSearchOpen = useChatStore((s) => s.setInChatSearchOpen);
  const setInChatSearchQuery = useChatStore((s) => s.setInChatSearchQuery);
  const inChatSearchOpen = useChatStore((s) => s.inChatSearchOpen);

  const [menuOpen, setMenuOpen] = useState(false);
  const display = getConversationDisplay(conversation, currentUser.id, onlineUserIds, currentUser);

  return (
    <header className="h-[57px] shrink-0 flex items-center gap-3 px-3 sm:px-4 bg-[var(--bg-surface)] border-b border-[var(--border-color)]">
      {/* Mobile back */}
      <button
        type="button"
        onClick={() => setMobileShowChat(false)}
        className="md:hidden p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer"
        aria-label="Back to conversation list"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => {
          if (window.innerWidth < 768) {
            openModal({ kind: 'report', targetType: 'conversation', targetId: conversation.id, targetName: display.title });
          }
        }}
        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
      >
        <Avatar
          name={display.title}
          avatarUrl={display.avatarUrl}
          isOnline={display.isOnline}
          isSavedMessages={display.isSavedMessages}
          showPresence={!display.isSavedMessages}
          size="md"
        />
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
            {display.title}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] truncate">{display.subtitle}</p>
        </div>
      </button>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            setInChatSearchQuery('');
            setInChatSearchOpen(!inChatSearchOpen);
          }}
          className={`p-2 rounded-md transition-colors cursor-pointer ${
            inChatSearchOpen
              ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
              : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="Search in conversation"
          aria-label="Search in conversation"
        >
          <Search className="w-4 h-4" />
        </button>

        {conversation.type === 'direct' && !display.isSavedMessages && (
          <>
            <button
              type="button"
              onClick={() => openModal({ kind: 'report', targetType: 'user', targetId: display.partner?.userId || '', targetName: display.partner?.displayName })}
              className="hidden sm:flex p-2 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              title="Report user"
              aria-label="Report user"
            >
              <Flag className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="hidden sm:flex p-2 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-default"
              title="Calls coming soon"
              aria-label="Voice call (coming soon)"
              onClick={() => window.alert('Voice and video calls are on the roadmap.')}
            >
              <Phone className="w-4 h-4" />
              <Video className="w-4 h-4 -ml-1.5 opacity-0" aria-hidden="true" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={toggleInfoPanel}
          className={`p-2 rounded-md transition-colors cursor-pointer ${
            isInfoPanelOpen
              ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
              : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="Toggle conversation info"
          aria-label="Toggle conversation info"
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>

      {/* Menu anchor cleanup */}
      {menuOpen && <Pin className="hidden" />}
    </header>
  );
}
