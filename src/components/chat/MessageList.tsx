import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  CornerUpLeft,
  Copy,
  Forward,
  Flag,
  Paperclip,
  Pencil,
  Pin,
  RotateCcw,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import type { Conversation, Message } from '../../types/messaging';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { formatFileSize, formatFullDateTime, formatMessageTime, formatDateDivider } from '../../lib/api';
import {
  useConversationMessages,
  useDeleteMessage,
  useTogglePin,
  useToggleReaction,
} from '../../queries/hooks';
import { Avatar } from '../ui/DesignSystem';

const QUICK_EMOJIS = ['👍', '👎', '😄', '🎉', '❤️', '👀', '🤔', '🚀'];

function fileSizeLabel(bytes: number) {
  return formatFileSize(bytes);
}

const AttachmentView: React.FC<{ message: Message; onOpenImage: (url: string, name?: string) => void }> = ({
  message,
  onOpenImage,
}) => {
  if (message.attachments.length === 0) return null;
  const images = message.attachments.filter((a) => a.fileType === 'image');
  const others = message.attachments.filter((a) => a.fileType !== 'image');

  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className={`grid gap-1 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {images.map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() => onOpenImage(att.url, att.fileName)}
              className="group relative rounded-md overflow-hidden border border-[var(--border-strong)] cursor-zoom-in max-h-64"
            >
              <img
                src={att.url}
                alt={att.fileName}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200 max-h-64"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
      {others.map((att) => (
        <a
          key={att.id}
          href={`${att.url}${att.url.includes('?') ? '&' : '?'}download=1&name=${encodeURIComponent(att.fileName)}`}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors max-w-xs"
        >
          <Paperclip className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold truncate">{att.fileName}</span>
            <span className="block text-[10px] text-[var(--text-muted)]">
              {fileSizeLabel(att.fileSize)} · {att.fileType}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
};

const MessageRow: React.FC<{
  message: Message;
  conversation: Conversation;
  isGrouped: boolean;
  onOpenImage: (url: string, name?: string) => void;
  onReact: (message: Message, emoji: string) => void;
}> = ({ message, conversation, isGrouped, onOpenImage, onReact }) => {
  const currentUser = useAuthStore((s) => s.user)!;
  const isOwn = message.senderId === currentUser.id;
  const openModal = useUIStore((s) => s.openModal);
  const pushToast = useUIStore((s) => s.pushToast);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);
  const deleteMessage = useDeleteMessage(conversation.id);
  const togglePin = useTogglePin(conversation.id);

  const [showEmoji, setShowEmoji] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const canModerate =
    conversation.type === 'group' && (conversation.myRole === 'owner' || conversation.myRole === 'admin');
  const canPin = conversation.type === 'direct' || canModerate;

  return (
    <div
      className={`group relative flex gap-2.5 px-2 ${isGrouped ? 'mt-0.5' : 'mt-3'} ${
        isOwn ? 'flex-row-reverse' : ''
      }`}
      data-message-id={message.id}
    >
      <div className="w-[38px] shrink-0">
        {!isGrouped && !isOwn && (
          <Avatar name={message.senderName} avatarUrl={message.senderAvatar} size="md" showPresence={false} />
        )}
      </div>

      <div className={`flex flex-col max-w-[78%] sm:max-w-[62%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isGrouped && !isOwn && conversation.type === 'group' && (
          <p className="text-[10px] font-bold text-[var(--text-secondary)] mb-0.5 px-0.5">
            {message.senderName}
          </p>
        )}

        <div className={`flex items-end gap-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          {/* Hover actions */}
          {!message.isDeleted && (
            <div
              className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pb-1 ${
                isOwn ? 'order-first' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => setReplyTo(conversation.id, message)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Reply"
              >
                <CornerUpLeft className="w-3.5 h-3.5" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmoji((v) => !v)}
                  className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="React"
                >
                  <SmilePlus className="w-3.5 h-3.5" />
                </button>
                {showEmoji && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
                    <div className="absolute bottom-7 z-50 flex gap-0.5 p-1 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg shadow-[var(--shadow-elevated)] fade-in-up">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            onReact(message, emoji);
                            setShowEmoji(false);
                          }}
                          className="w-7 h-7 flex items-center justify-center text-base rounded hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowMenu((v) => !v)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title="More"
              >
                <Copy className="w-3.5 h-3.5 rotate-90" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div
                    className={`absolute bottom-7 z-50 w-44 py-1 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md shadow-[var(--shadow-elevated)] fade-in-up ${
                      isOwn ? 'right-0' : 'left-0'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(message.content).catch(() => undefined);
                        pushToast({ kind: 'info', title: 'Copied to clipboard' });
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy text
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openModal({ kind: 'forward', message });
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <Forward className="w-3.5 h-3.5" /> Forward…
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openModal({
                          kind: 'report',
                          targetType: 'message',
                          targetId: message.id,
                          targetName: `message from ${message.senderName}`,
                        });
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5" /> Report message
                    </button>
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessage(message);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                    {canPin && (
                      <button
                        type="button"
                        onClick={() => {
                          togglePin.mutate(message.id);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                      >
                        <Pin className="w-3.5 h-3.5" /> {message.isPinned ? 'Unpin' : 'Pin'}
                      </button>
                    )}
                    {(isOwn || canModerate || conversation.createdBy === currentUser.id) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Delete this message?')) {
                            deleteMessage.mutate(message.id);
                          }
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bubble */}
          <div
            className={`rounded-lg border px-3 py-2 transition-colors ${
              message.isDeleted
                ? 'bg-transparent border-[var(--border-subtle)]'
                : isOwn
                  ? 'bg-[var(--msg-out-bg)] text-[var(--msg-out-text)] border-[var(--msg-out-border)]'
                  : 'bg-[var(--msg-in-bg)] text-[var(--msg-in-text)] border-[var(--msg-in-border)]'
            } ${message.clientStatus === 'sending' ? 'opacity-60' : ''} ${
              message.clientStatus === 'failed' ? 'opacity-80 border-dashed' : ''
            }`}
          >
            {message.forwardedFromName && (
              <p className="text-[10px] italic text-[var(--text-muted)] flex items-center gap-1 mb-1">
                <Forward className="w-3 h-3" /> forwarded from {message.forwardedFromName}
              </p>
            )}

            {message.replyTo && (
              <div className="mb-1.5 pl-2 border-l-2 border-[var(--text-muted)]">
                <p className="text-[10px] font-bold text-[var(--text-secondary)]">
                  {message.replyTo.senderName}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                  {message.replyTo.isDeleted
                    ? 'Message deleted'
                    : message.replyTo.content ||
                      (message.replyTo.hasAttachment ? '📎 Attachment' : '')}
                </p>
              </div>
            )}

            {message.isDeleted ? (
              <p className="text-xs italic text-[var(--text-muted)] flex items-center gap-1.5">
                <RotateCcw className="w-3 h-3" /> This message was deleted
              </p>
            ) : (
              <>
                {message.content && (
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                )}
                <AttachmentView message={message} onOpenImage={onOpenImage} />
              </>
            )}

            <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? 'justify-end' : ''}`}>
              <span className="text-[10px] text-[var(--text-muted)]" title={formatFullDateTime(message.createdAt)}>
                {formatMessageTime(message.createdAt)}
                {message.isEdited && ' · edited'}
              </span>
              {isOwn && !message.isDeleted && (
                <span title={message.readBy.length > 0 ? `Read by ${message.readBy.length}` : 'Sent'}>
                  {message.clientStatus === 'sending' ? (
                    <Check className="w-3 h-3 text-[var(--text-muted)]" />
                  ) : message.readBy.length > 0 ? (
                    <CheckCheck className="w-3 h-3 text-[var(--text-primary)]" />
                  ) : (
                    <CheckCheck className="w-3 h-3 text-[var(--text-muted)]" />
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Reactions */}
        {!message.isDeleted && message.reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(message, reaction.emoji)}
                title={reaction.users.map((u) => u.displayName).join(', ')}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] cursor-pointer transition-colors ${
                  reaction.reactedByMe
                    ? 'bg-[var(--bg-inverted)] text-[var(--text-inverted)] border-transparent'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span>{reaction.emoji}</span>
                <span className="font-bold">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export function MessageList({ conversation }: { conversation: Conversation }) {
  const currentUser = useAuthStore((s) => s.user)!;
  const openModal = useUIStore((s) => s.openModal);
  const highlightedMessageId = useChatStore((s) => s.highlightedMessageId);
  const toggleReaction = useToggleReaction(conversation.id);

  const onReact = React.useCallback(
    (message: Message, emoji: string) => {
      toggleReaction.mutate({ id: message.id, emoji });
    },
    [toggleReaction],
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useConversationMessages(conversation.id);

  const messages = useMemo(
    () => (data ? data.pages.flatMap((page) => page.messages) : []),
    [data],
  );
  const pinnedMessages = useMemo(
    () => data?.pages[0]?.pinnedMessages || [],
    [data],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef(0);
  const prevMessageCountRef = useRef(0);

  // Scroll to bottom on new messages when near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const count = messages.length;
    if (count !== prevMessageCountRef.current) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
      if (count > prevMessageCountRef.current && (nearBottom || prevMessageCountRef.current === 0)) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
      prevMessageCountRef.current = count;
    }
  }, [messages.length]);

  // Preserve scroll position when loading older pages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isFetchingNextPage) return;
    prevHeightRef.current = el.scrollHeight;
  }, [isFetchingNextPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isFetchingNextPage || prevHeightRef.current === 0) return;
    el.scrollTop = el.scrollHeight - prevHeightRef.current;
    prevHeightRef.current = 0;
  }, [data?.pages.length, isFetchingNextPage]);

  // Highlight jump
  useEffect(() => {
    if (!highlightedMessageId) return;
    const el = scrollRef.current?.querySelector(`[data-message-id="${highlightedMessageId}"]`);
    (el as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedMessageId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center chat-wallpaper">
        <div className="flex gap-1.5" aria-label="Loading messages">
          <span className="typing-dot-1 w-2 h-2 rounded-full bg-[var(--text-muted)]" />
          <span className="typing-dot-2 w-2 h-2 rounded-full bg-[var(--text-muted)]" />
          <span className="typing-dot-3 w-2 h-2 rounded-full bg-[var(--text-muted)]" />
        </div>
      </div>
    );
  }

  let lastDate = '';

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto chat-wallpaper py-3 relative"
      role="log"
      aria-label={`Messages in ${conversation.name || 'conversation'}`}
    >
      {/* Load older */}
      {hasNextPage && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-strong)] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
          </button>
        </div>
      )}

      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm font-bold text-[var(--text-secondary)]">No messages yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Send the first monochrome hello.
          </p>
        </div>
      )}

      {messages.map((message, index) => {
        const dateDivider = formatDateDivider(message.createdAt);
        const showDivider = dateDivider !== lastDate;
        if (showDivider) lastDate = dateDivider;
        const prev = messages[index - 1];
        const isGrouped =
          !showDivider &&
          prev &&
          prev.senderId === message.senderId &&
          new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 4 * 60 * 1000;

        return (
          <React.Fragment key={message.id}>
            {showDivider && (
              <div className="flex items-center gap-3 px-4 py-2">
                <span className="h-px flex-1 bg-[var(--border-color)]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {dateDivider}
                </span>
                <span className="h-px flex-1 bg-[var(--border-color)]" />
              </div>
            )}
            <MessageRow
              message={message}
              conversation={conversation}
              isGrouped={isGrouped}
              onOpenImage={(url, name) => openModal({ kind: 'lightbox', url, fileName: name })}
              onReact={onReact}
            />
          </React.Fragment>
        );
      })}

      {/* Read receipt footer for own last message */}
      {(() => {
        const lastOwn = [...messages].reverse().find((m) => m.senderId === currentUser.id && !m.isDeleted);
        if (!lastOwn || lastOwn.readBy.length === 0) return null;
        return (
          <p className="text-[10px] text-[var(--text-muted)] text-right px-4 pt-1">
            Read by {lastOwn.readBy.map((r) => r.displayName.split(' ')[0]).join(', ')}
          </p>
        );
      })()}

      {/* Pinned messages bar */}
      {pinnedMessages.length > 0 && (
        <div className="sticky bottom-0 px-3 pb-1 pointer-events-none" aria-hidden="true" />
      )}
    </div>
  );
}
