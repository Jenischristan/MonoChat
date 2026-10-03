import { create } from 'zustand';
import type { Message } from '../types/messaging';

export interface TypingUser {
  userId: string;
  displayName: string;
}

const DRAFTS_STORAGE_KEY = 'monochat_message_drafts_v1';

function loadDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistDrafts(drafts: Record<string, string>) {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // ignore
  }
}

interface ChatState {
  onlineUserIds: Set<string>;
  typingByConv: Record<string, TypingUser[]>;
  drafts: Record<string, string>;
  replyToByConv: Record<string, Message | null>;
  editingMessage: Message | null;
  inChatSearchOpen: boolean;
  inChatSearchQuery: string;
  highlightedMessageId: string | null;

  setOnlineUserIds: (ids: string[]) => void;
  addOnlineUser: (userId: string) => void;
  removeOnlineUser: (userId: string) => void;
  setTyping: (conversationId: string, user: TypingUser | null) => void;
  setDraft: (conversationId: string, text: string) => void;
  setReplyTo: (conversationId: string, message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;
  setInChatSearchOpen: (open: boolean) => void;
  setInChatSearchQuery: (query: string) => void;
  setHighlightedMessageId: (id: string | null) => void;
  clearConversationClientState: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  onlineUserIds: new Set(),
  typingByConv: {},
  drafts: loadDrafts(),
  replyToByConv: {},
  editingMessage: null,
  inChatSearchOpen: false,
  inChatSearchQuery: '',
  highlightedMessageId: null,

  setOnlineUserIds: (ids) => set({ onlineUserIds: new Set(ids) }),

  addOnlineUser: (userId) => {
    const next = new Set(get().onlineUserIds);
    next.add(userId);
    set({ onlineUserIds: next });
  },

  removeOnlineUser: (userId) => {
    const next = new Set(get().onlineUserIds);
    next.delete(userId);
    set({ onlineUserIds: next });
  },

  setTyping: (conversationId, user) => {
    set((state) => {
      const current = [...(state.typingByConv[conversationId] || [])];
      const filtered = current.filter((t) => t.userId !== user?.userId);
      if (user) {
        filtered.push(user);
      }
      return {
        typingByConv: {
          ...state.typingByConv,
          [conversationId]: filtered,
        },
      };
    });
  },

  setDraft: (conversationId, text) => {
    set((state) => {
      const drafts = { ...state.drafts, [conversationId]: text };
      persistDrafts(drafts);
      return { drafts };
    });
  },

  setReplyTo: (conversationId, message) =>
    set((state) => ({
      replyToByConv: { ...state.replyToByConv, [conversationId]: message },
    })),

  setEditingMessage: (message) => set({ editingMessage: message }),

  setInChatSearchOpen: (inChatSearchOpen) => set({ inChatSearchOpen }),
  setInChatSearchQuery: (inChatSearchQuery) => set({ inChatSearchQuery }),
  setHighlightedMessageId: (highlightedMessageId) => set({ highlightedMessageId }),

  clearConversationClientState: (conversationId) => {
    set((state) => {
      const drafts = { ...state.drafts };
      delete drafts[conversationId];
      const replyToByConv = { ...state.replyToByConv };
      delete replyToByConv[conversationId];
      const typingByConv = { ...state.typingByConv };
      delete typingByConv[conversationId];
      persistDrafts(drafts);
      return { drafts, replyToByConv, typingByConv };
    });
  },
}));
