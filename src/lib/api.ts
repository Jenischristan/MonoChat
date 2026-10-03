import type { Attachment, Conversation, ConversationMember, User } from '../types/messaging';

const TOKEN_STORAGE_KEY = 'monochat_auth_token';
let memoryToken: string | null = null;

export function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      memoryToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage errors in restricted iframes
  }
  return memoryToken;
}

export function setStoredToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted iframes
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(endpoint, { ...options, headers });
  } catch (err: any) {
    if (err?.name === 'AbortError' || options.signal?.aborted) {
      throw err;
    }
    // Automatic retry once after 350ms if transient network hiccup occurs
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      res = await fetch(endpoint, { ...options, headers });
    } catch {
      throw new ApiError('Network connection issue. Please check your connection.', 0);
    }
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (res.status === 401) {
      setStoredToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }

  return data as T;
}

export async function uploadFileAttachment(file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append('file', file);
  const data = await apiFetch<{ attachment: Attachment }>('/api/files/upload', {
    method: 'POST',
    body: formData,
  });
  return data.attachment;
}

export function formatShortTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const formatRelativeTime = formatShortTimestamp;

export function formatFullDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatMessageTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateDivider(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatLastSeen(isoString: string | null | undefined): string {
  if (!isoString) return 'Offline';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Offline';

  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return 'Last seen just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Last seen ${diffHr}h ago`;
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function getConversationPartner(
  conv: Conversation,
  currentUserId: string,
): ConversationMember | null {
  if (conv.type !== 'direct') return null;
  return conv.members.find((m) => m.userId !== currentUserId) || null;
}

export function getConversationDisplay(
  conv: Conversation,
  currentUserId: string,
  onlineUserIds: Set<string> = new Set(),
  currentUser?: User | null,
) {
  if (conv.type === 'group') {
    const onlineCount = conv.members.filter(
      (m) => onlineUserIds.has(m.userId) || m.isOnline,
    ).length;
    return {
      title: conv.name || 'Untitled Group',
      subtitle: `${conv.members.length} ${conv.members.length === 1 ? 'member' : 'members'} · ${onlineCount} online`,
      avatarUrl: conv.avatarUrl,
      isOnline: onlineCount > 0,
      isGroup: true,
      isSavedMessages: false,
      partner: null,
    };
  }

  const partner = getConversationPartner(conv, currentUserId);

  if (!partner) {
    return {
      title: conv.name || 'Saved Messages',
      subtitle: conv.description || 'Personal notes & cloud storage',
      avatarUrl: conv.avatarUrl || currentUser?.avatarUrl || null,
      isOnline: true,
      isGroup: false,
      isSavedMessages: true,
      partner: null,
    };
  }

  const showOnline = currentUser?.settings?.showOnlineStatus !== false;
  const isOnline = showOnline && partner ? onlineUserIds.has(partner.userId) || partner.isOnline : false;

  return {
    title: partner.displayName,
    subtitle: isOnline
      ? `online${partner.statusText ? ` · ${partner.statusText}` : ''}`
      : formatLastSeen(partner.lastSeenAt),
    avatarUrl: partner.avatarUrl,
    isOnline,
    isGroup: false,
    isSavedMessages: false,
    partner,
  };
}
