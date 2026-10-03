import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Send, Smile, Trash2, X } from 'lucide-react';
import type { Attachment, Conversation, Message } from '../../types/messaging';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { realtime } from '../../lib/ws';
import { formatFileSize } from '../../lib/api';
import {
  useSendMessage,
  useUpdateConversationState,
  useUploadAttachment,
  useEditMessage,
  useConversationMessages,
} from '../../queries/hooks';

const QUICK_EMOJIS = ['👍', '❤️', '😄', '🎉', '👀', '🙏', '😢', '🔥'];

function generateTempId(): string {
  return `temp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function MessageComposer({ conversation }: { conversation: Conversation }) {
  const currentUser = useAuthStore((s) => s.user)!;
  const draft = useChatStore((s) => s.drafts[conversation.id] || '');
  const setDraft = useChatStore((s) => s.setDraft);
  const replyTo = useChatStore((s) => s.replyToByConv[conversation.id] || null);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const editingMessage = useChatStore((s) => s.editingMessage);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);
  const pushToast = useUIStore((s) => s.pushToast);

  const sendMessage = useSendMessage(conversation.id);
  const editMessage = useEditMessage(conversation.id);
  const updateState = useUpdateConversationState(conversation.id);
  const uploadAttachment = useUploadAttachment();
  const { refetch } = useConversationMessages(conversation.id);

  const [text, setText] = useState(draft);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);

  // Load draft on conversation change
  useEffect(() => {
    setText(useChatStore.getState().drafts[conversation.id] || '');
    setPendingAttachments([]);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [conversation.id]);

  // Enter edit mode
  useEffect(() => {
    if (editingMessage && editingMessage.conversationId === conversation.id) {
      setText(editingMessage.content);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editingMessage, conversation.id]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  // Debounced draft persistence + conversation state sync
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (useChatStore.getState().drafts[conversation.id] !== text) {
        setDraft(conversation.id, text);
      }
      if (text && text !== (conversation.draftText || '')) {
        updateState.mutate({ draftText: text.slice(0, 4000) });
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [text, conversation.id]);

  const signalTyping = () => {
    if (currentUser.settings?.showTypingIndicator === false) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      realtime.sendTyping(conversation.id, true);
    }
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      realtime.sendTyping(conversation.id, false);
    }, 2600);
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (editingMessage) {
      if (!trimmed) return;
      editMessage.mutate(
        { id: editingMessage.id, content: trimmed },
        {
          onSuccess: () => {
            setEditingMessage(null);
            setText('');
            refetch();
          },
        },
      );
      return;
    }

    if (!trimmed && pendingAttachments.length === 0) return;

    const tempId = generateTempId();
    sendMessage.mutate({
      content: trimmed,
      replyToId: replyTo?.id || null,
      attachmentIds: pendingAttachments.map((a) => a.id),
      tempId,
    });
    setText('');
    setPendingAttachments([]);
    setReplyTo(conversation.id, null);
    setDraft(conversation.id, '');

    requestAnimationFrame(() => {
      const el = document.querySelector('[role="log"]');
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        const attachment = await uploadAttachment.mutateAsync(file);
        setPendingAttachments((prev) => [...prev, attachment]);
      }
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Upload failed', body: err?.message });
    } finally {
      setUploading(false);
    }
  };

  const canSend = Boolean(text.trim() || pendingAttachments.length > 0) && !sendMessage.isPending;

  return (
    <div
      className={`shrink-0 bg-[var(--bg-surface)] border-t border-[var(--border-color)] transition-colors ${
        dragOver ? 'border-[var(--text-primary)]' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
      }}
    >
      {/* Reply banner */}
      {replyTo && !editingMessage && (
        <div className="flex items-center gap-2.5 mx-3 mt-2.5 px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)]">
          <div className="w-0.5 self-stretch bg-[var(--text-secondary)]" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Replying to {replyTo.senderName}
            </p>
            <p className="text-xs text-[var(--text-muted)] truncate">
              {replyTo.isDeleted ? 'Message deleted' : replyTo.content || '📎 Attachment'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(conversation.id, null)}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer"
            aria-label="Cancel reply"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Edit banner */}
      {editingMessage && editingMessage.conversationId === conversation.id && (
        <div className="flex items-center gap-2.5 mx-3 mt-2.5 px-3 py-2 rounded-md border border-[var(--text-secondary)]/40 bg-[var(--bg-elevated)]">
          <div className="w-0.5 self-stretch bg-[var(--text-primary)]" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Editing message
            </p>
            <p className="text-xs text-[var(--text-muted)] truncate">{editingMessage.content}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingMessage(null);
              setText('');
            }}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer"
            aria-label="Cancel edit"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending attachments */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mx-3 mt-2.5">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="relative flex items-center gap-2 pl-2 pr-7 py-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] max-w-[220px]"
            >
              {att.fileType === 'image' ? (
                <img src={att.url} alt={att.fileName} className="w-8 h-8 rounded object-cover" />
              ) : (
                <Paperclip className="w-4 h-4 text-[var(--text-muted)]" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold truncate">{att.fileName}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{formatFileSize(att.fileSize)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer"
                aria-label={`Remove ${att.fileName}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1.5 p-2.5 sm:p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
          title="Attach files"
          aria-label="Attach files"
        >
          {uploading ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Paperclip className="w-4.5 h-4.5" />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="p-2.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Emoji"
            aria-label="Insert emoji"
          >
            <Smile className="w-4.5 h-4.5" />
          </button>
          {showEmoji && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
              <div className="absolute bottom-11 left-0 z-50 grid grid-cols-4 gap-0.5 p-2 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg shadow-[var(--shadow-elevated)] fade-in-up">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setText((t) => t + emoji);
                      setShowEmoji(false);
                      textareaRef.current?.focus();
                    }}
                    className="w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            signalTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && currentUser.settings?.enterToSend !== false) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Message ${conversation.name || ''}`.trim() || 'Write a message…'}
          className="flex-1 resize-none bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none py-2 max-h-40"
          aria-label="Message input"
        />

        {editingMessage ? (
          <button
            type="button"
            onClick={() => {
              setEditingMessage(null);
              setText('');
            }}
            className="p-2.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer"
            title="Cancel edit"
            aria-label="Cancel edit"
          >
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="p-2.5 rounded-md bg-[var(--bg-inverted)] text-[var(--text-inverted)] hover:opacity-90 transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          title={editingMessage ? 'Save changes' : 'Send message'}
          aria-label={editingMessage ? 'Save changes' : 'Send message'}
        >
          {sendMessage.isPending ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <Send className="w-4.5 h-4.5" />
          )}
        </button>
      </div>
    </div>
  );
}
