import React from 'react';
import { ArrowLeft, Flag, Info, PanelRight, Phone, Search, Users, Video } from 'lucide-react';
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
  const pushToast = useUIStore((s) => s.pushToast);

  const display = getConversationDisplay(conversation, currentUser.id, onlineUserIds, currentUser);

  const handleCallNotice = () => {
    pushToast({
      kind: 'info',
      title: 'Voice & Video Calls',
      body: 'Real-time peer-to-peer encrypted calls are coming in the next release.',
    });
  };

  return (
    <header className="h-16 shrink-0 flex items-center justify-between gap-3 px-4 sm:px-5 bg-[var(--bg-surface)] border-b border-[var(--border-color)] z-20">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile back button */}
        <button
          type="button"
          onClick={() => setMobileShowChat(false)}
          className="md:hidden p-2 -ml-1 rounded-xl hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={toggleInfoPanel}
          className="flex items-center gap-3 min-w-0 text-left cursor-pointer group"
          title="Conversation details"
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
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold tracking-tight text-[var(--text-primary)] group-hover:opacity-85 truncate">
                {display.title}
              </p>
              {conversation.type === 'group' && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">
                  {conversation.members.length} members
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate">
              {display.isOnline && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              )}
              <span className="truncate">{display.subtitle}</span>
            </div>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant={inChatSearchOpen ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => {
            setInChatSearchQuery('');
            setInChatSearchOpen(!inChatSearchOpen);
          }}
          className="rounded-xl h-8.5 w-8.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title="Search messages in chat"
          aria-label="Search in conversation"
        >
          <Search className="w-4 h-4" />
        </Button>

        {conversation.type === 'direct' && !display.isSavedMessages && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCallNotice}
              className="hidden sm:inline-flex rounded-xl h-8.5 w-8.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              title="Voice call"
              aria-label="Voice call"
            >
              <Phone className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCallNotice}
              className="hidden sm:inline-flex rounded-xl h-8.5 w-8.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              title="Video call"
              aria-label="Video call"
            >
              <Video className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                openModal({
                  kind: 'report',
                  targetType: 'user',
                  targetId: display.partner?.userId || '',
                  targetName: display.partner?.displayName,
                })
              }
              className="hidden sm:inline-flex rounded-xl h-8.5 w-8.5 text-[var(--text-muted)] hover:text-rose-400"
              title="Report user"
              aria-label="Report user"
            >
              <Flag className="w-4 h-4" />
            </Button>
          </>
        )}

        <Button
          variant={isInfoPanelOpen ? 'secondary' : 'ghost'}
          size="icon"
          onClick={toggleInfoPanel}
          className="rounded-xl h-8.5 w-8.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title="Details and media"
          aria-label="Toggle details"
        >
          <PanelRight className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
