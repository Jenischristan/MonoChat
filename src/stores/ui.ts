import { create } from 'zustand';
import type { ConversationFilter, Message, ThemeMode } from '../types/messaging';
import {
  CHAT_BACKGROUNDS,
  type ChatBackgroundId,
  getChatBackgroundOption,
  getStoredChatBackground,
  setStoredChatBackground,
} from '../lib/wallpapers';

export type Toast = {
  id: number;
  kind: 'info' | 'success' | 'error';
  title: string;
  body?: string;
};

export type ModalState =
  | { kind: 'none' }
  | { kind: 'settings'; initialTab?: string }
  | { kind: 'search' }
  | { kind: 'new-chat'; initialMode?: 'direct' | 'group' }
  | { kind: 'report'; targetType: 'user' | 'conversation' | 'message'; targetId: string; targetName?: string }
  | { kind: 'forward'; message: Message }
  | { kind: 'lightbox'; url: string; fileName?: string };

const THEME_STORAGE_KEY = 'monochat_theme_mode_v2';

function getInitialThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // ignore
  }
  return 'dark';
}

interface UIState {
  themeMode: ThemeMode;
  filter: ConversationFilter;
  sidebarSearch: string;
  mobileShowChat: boolean;
  isInfoPanelOpen: boolean;
  chatBackground: ChatBackgroundId;
  modal: ModalState;
  toasts: Toast[];
  themePrefix: () => 'light' | 'dark';

  setThemeMode: (mode: ThemeMode) => void;
  setFilter: (filter: ConversationFilter) => void;
  setSidebarSearch: (search: string) => void;
  setMobileShowChat: (show: boolean) => void;
  toggleInfoPanel: () => void;
  setChatBackground: (id: ChatBackgroundId) => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>((set, get) => ({
  themeMode: getInitialThemeMode(),
  filter: 'all',
  sidebarSearch: '',
  mobileShowChat: false,
  isInfoPanelOpen: true,
  chatBackground: getStoredChatBackground(),
  modal: { kind: 'none' },
  toasts: [],

  themePrefix: () => {
    const mode = get().themeMode;
    if (mode === 'system') {
      return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return mode;
  },

  setThemeMode: (mode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
    set({ themeMode: mode });
  },

  setFilter: (filter) => set({ filter }),
  setSidebarSearch: (sidebarSearch) => set({ sidebarSearch }),
  setMobileShowChat: (mobileShowChat) => set({ mobileShowChat }),
  toggleInfoPanel: () => set((s) => ({ isInfoPanelOpen: !s.isInfoPanelOpen })),

  setChatBackground: (id) => {
    setStoredChatBackground(id);
    set({ chatBackground: id });
  },

  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: { kind: 'none' } }),

  pushToast: (toast) => {
    const id = ++toastCounter;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4200);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export { CHAT_BACKGROUNDS, getChatBackgroundOption };
