import { create } from 'zustand';
import type { User } from '../types/messaging';
import { ApiError, apiFetch, getStoredToken, setStoredToken } from '../lib/api';

interface AuthState {
  token: string | null;
  user: User | null;
  booting: boolean;
  setUser: (user: User | null) => void;
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<User>;
  register: (payload: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getStoredToken(),
  user: null,
  booting: true,

  setUser: (user) => set({ user }),

  bootstrap: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ booting: false, user: null });
      return;
    }
    try {
      const data = await apiFetch<{ user: User }>('/api/auth/me');
      set({ user: data.user, booting: false });
    } catch (err) {
      // Only a definitive 401 means the session is gone. Network blips or
      // transient 5xx must NOT log the user out — keep the token and let
      // queries retry once connectivity returns.
      if (err instanceof ApiError && err.status === 401) {
        setStoredToken(null);
        set({ user: null, booting: false });
        return;
      }
      set({ booting: false });
    }
  },

  login: async (identifier, password) => {
    const data = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setStoredToken(data.token);
    set({ token: data.token, user: data.user });
    return data.user;
  },

  register: async (payload) => {
    const data = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(data.token);
    set({ token: data.token, user: data.user });
    return data.user;
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Token may already be invalid — clear locally regardless
    }
    setStoredToken(null);
    set({ token: null, user: null });
  },
}));
