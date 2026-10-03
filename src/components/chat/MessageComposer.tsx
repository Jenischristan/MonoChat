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

const QUICK_EMOJIS = ['👍', '❤️', '😄', '🎉', '👀', '🙏', '🔥', '✨', '🚀', '💯', '👏', '🤔'];

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
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  // Debounced draft persistence
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
      pushToast({ kind: 'error', title: 'Upload failed', body: err?.message || 'File upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const canSend = Boolean(text.trim() || pendingAttachments.length > 0) && !sendMessage.isPending;

  return (
    <div
      className={`shrink-0 bg-[var(--bg-surface)] p-3 sm:p-4 border-t border-[var(--border-color)] transition-all ${
        dragOver ? 'bg-[var(--bg-hover)]' : ''
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
      {/* Reply Banner */}
      {replyTo && !editingMessage && (
        <div className="flex items-center gap-3 mb-2.5 px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] fade-in-up">
          <div className="w-1 self-stretch rounded-full bg-[var(--text-primary)]" />
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
            className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="Cancel reply"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Edit Banner */}
      {editingMessage && editingMessage.conversationId === conversation.id && (
        <div className="flex items-center gap-3 mb-2.5 px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] fade-in-up">
          <div className="w-1 self-stretch rounded-full bg-[var(--text-primary)]" />
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
            className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="Cancel edit"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Attachments */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="relative flex items-center gap-2.5 pl-2.5 pr-8 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] max-w-[240px] shadow-xs"
            >
              {att.fileType === 'image' ? (
                <img src={att.url} alt={att.fileName} className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <Paperclip className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{att.fileName}</p>
                <p className="text-[10px] text-[var(--text-muted)] font-mono">{formatFileSize(att.fileSize)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                aria-label={`Remove ${att.fileName}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Box */}
      <div className="relative flex items-end gap-2 p-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] focus-within:border-[var(--border-focus)] rounded-2xl shadow-xs transition-all">
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

        <div className="flex items-center gap-0.5 self-end pb-0.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
            title="Attach file or photo"
            aria-label="Attach file"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="Add emoji"
              aria-label="Insert emoji"
            >
              <Smile className="w-4 h-4" />
            </button>
            {showEmoji && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
                <div className="absolute bottom-12 left-0 z-50 grid grid-cols-6 gap-1 p-2 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-elevated)] fade-in-up backdrop-blur-md">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setText((t) => t + emoji);
                        setShowEmoji(false);
                        textareaRef.current?.focus();
                      }}
                      className="w-8 h-8 flex items-center justify-center text-base rounded-lg hover:bg-[var(--bg-hover)] cursor-pointer transition-transform hover:scale-115"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
          className="flex-1 resize-none bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none py-2 px-1 max-h-44 min-h-[36px]"
          aria-label="Message input"
        />

        {editingMessage && (
          <button
            type="button"
            onClick={() => {
              setEditingMessage(null);
              setText('');
            }}
            className="p-2 self-end pb-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
            title="Cancel edit"
            aria-label="Cancel edit"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="h-8.5 w-8.5 self-end mb-0.5 rounded-xl bg-[var(--bg-inverted)] text-[var(--text-inverted)] hover:opacity-90 transition-all cursor-pointer flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-xs"
          title={editingMessage ? 'Save changes' : 'Send message (Enter)'}
          aria-label={editingMessage ? 'Save changes' : 'Send message'}
        >
          {sendMessage.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
