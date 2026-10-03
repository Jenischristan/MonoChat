import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AppNotification,
  Conversation,
  Message,
  User,
} from '../types/messaging';
import { apiFetch, uploadFileAttachment } from '../lib/api';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';

export const queryKeys = {
  conversations: ['conversations'] as const,
  messages: (convId: string) => ['messages', convId] as const,
  notifications: ['notifications'] as const,
  users: (q: string) => ['users', q] as const,
  search: (q: string) => ['search', q] as const,
  shared: (convId: string) => ['shared', convId] as const,
  user: (id: string) => ['user', id] as const,
};

export interface MessagesPage {
  messages: Message[];
  hasMore: boolean;
  pinnedMessages: Message[];
}

export function useConversations(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => {
      const data = await apiFetch<{ conversations: Conversation[] }>(
        `/api/conversations${includeArchived ? '?includeArchived=1' : ''}`,
      );
      return data.conversations;
    },
    staleTime: 10_000,
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(conversationId || 'none'),
    enabled: Boolean(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam) params.set('before', pageParam);
      const data = await apiFetch<MessagesPage>(
        `/api/messages/conversation/${conversationId}?${params.toString()}`,
      );
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.messages.length > 0
        ? lastPage.messages[0].id
        : undefined,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: async () => {
      const data = await apiFetch<{ notifications: AppNotification[]; unreadCount: number }>(
        '/api/notifications',
      );
      return data;
    },
    staleTime: 5_000,
  });
}

export function useUserDirectory(q: string) {
  return useQuery({
    queryKey: queryKeys.users(q),
    queryFn: async () => {
      const data = await apiFetch<{ users: User[] }>(
        `/api/users?excludeSelf=1&q=${encodeURIComponent(q)}`,
      );
      return data.users;
    },
    enabled: true,
    staleTime: 15_000,
  });
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: queryKeys.search(q),
    queryFn: async () => {
      const data = await apiFetch<{
        users: User[];
        conversations: Conversation[];
        messages: any[];
        files: any[];
      }>(`/api/search?q=${encodeURIComponent(q)}`);
      return data;
    },
    enabled: q.trim().length > 0,
    staleTime: 5_000,
  });
}

export interface SharedMedia {
  media: any[];
  files: any[];
  links: any[];
}

export function useSharedMedia(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.shared(conversationId || 'none'),
    queryFn: async () => {
      const data = await apiFetch<SharedMedia>(
        `/api/messages/conversation/${conversationId}/shared`,
      );
      return data;
    },
    enabled: Boolean(conversationId),
    staleTime: 30_000,
  });
}

/* ------------------------------ mutations ------------------------------ */

export function useInvalidateConversations() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.conversations });
}

export function useSendMessage(conversationId: string | null) {
  const qc = useQueryClient();
  const setReplyTo = useChatStore((s) => s.setReplyTo);

  return useMutation({
    mutationFn: async (variables: {
      content: string;
      replyToId?: string | null;
      attachmentIds?: string[];
      tempId: string;
    }) => {
      const data = await apiFetch<{ message: Message; tempId: string | null }>(
        `/api/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: variables.content,
            replyToId: variables.replyToId || null,
            attachmentIds: variables.attachmentIds || [],
            tempId: variables.tempId,
          }),
        },
      );
      return data;
    },
    onMutate: async (variables) => {
      const tempMessage: Message = {
        id: variables.tempId,
        tempId: variables.tempId,
        clientStatus: 'sending',
        conversationId: conversationId || '',
        senderId: useAuthStore.getState().user?.id || '',
        senderName: useAuthStore.getState().user?.displayName || '',
        senderUsername: useAuthStore.getState().user?.username || '',
        senderAvatar: useAuthStore.getState().user?.avatarUrl || null,
        content: variables.content,
        replyToId: variables.replyToId || null,
        replyTo: null,
        forwardedFromId: null,
        forwardedFromName: null,
        isEdited: false,
        isDeleted: false,
        isPinned: false,
        createdAt: new Date().toISOString(),
        attachments: [],
        reactions: [],
        readBy: [],
      };
      qc.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        queryKeys.messages(conversationId || 'none'),
        (old) => {
          if (!old) return old;
          const pages = [...old.pages];
          pages[pages.length - 1] = {
            ...pages[pages.length - 1],
            messages: [...pages[pages.length - 1].messages, tempMessage],
          };
          return { ...old, pages };
        },
      );
      if (variables.replyToId) {
        setReplyTo(conversationId || '', null);
      }
    },
    onSuccess: (data) => {
      reconcileTempMessage(qc, conversationId || '', data.tempId || '', data.message, 'sent');
      // Refresh conversation list (lastMessage / unread counters)
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
    onError: (_, variables) => {
      reconcileTempMessage(qc, conversationId || '', variables.tempId, null, 'failed');
    },
  });
}

/** Replace an optimistic temp message with the confirmed or failed state */
export function reconcileTempMessage(
  qc: QueryClient,
  conversationId: string,
  tempId: string,
  message: Message | null,
  status: 'sent' | 'failed',
) {
  qc.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
    queryKeys.messages(conversationId),
    (old) => {
      if (!old) return old;
      const pages = old.pages.map((page) => {
        const filtered = page.messages.filter(
          (m) => m.id !== tempId && m.tempId !== tempId && (!message || m.id !== message.id),
        );
        return { ...page, messages: filtered };
      });
      if (message) {
        pages[pages.length - 1] = {
          ...pages[pages.length - 1],
          messages: [...pages[pages.length - 1].messages, { ...message, clientStatus: status }],
        };
      }
      return { ...old, pages };
    },
  );
}

export function useEditMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const data = await apiFetch<{ message: Message }>(`/api/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      return data;
    },
    onSuccess: (data) => {
      patchMessageInCache(qc, conversationId, data.message);
    },
  });
}

export function useDeleteMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const data = await apiFetch(`/api/messages/${id}`, { method: 'DELETE' });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messages(conversationId || 'none') });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useToggleReaction(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, emoji }: { id: string; emoji: string }) => {
      const data = await apiFetch<{ reactions: Message['reactions']; message: Message }>(
        `/api/messages/${id}/reactions`,
        { method: 'POST', body: JSON.stringify({ emoji }) },
      );
      return data;
    },
    onSuccess: (data) => {
      patchMessageInCache(qc, conversationId, data.message);
    },
  });
}

export function useTogglePin(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const data = await apiFetch<{
        success: boolean;
        messageId: string;
        isPinned: boolean;
        pinnedMessageId: string | null;
      }>(`/api/messages/${id}/pin`, { method: 'POST' });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messages(conversationId || 'none') });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const data = await apiFetch<{ conversation: Conversation }>(
        `/api/conversations/${conversationId}/read`,
        { method: 'POST' },
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.conversation) {
        patchConversationInCache(qc, data.conversation);
      }
    },
  });
}

export function useUpdateConversationState(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const data = await apiFetch<{ conversation: Conversation; deleted?: boolean }>(
        `/api/conversations/${conversationId}/state`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
      if (data.conversation) {
        patchConversationInCache(qc, data.conversation);
      }
    },
  });
}

export function useStartDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const data = await apiFetch<{ conversation: Conversation; created: boolean }>(
        '/api/conversations/direct',
        { method: 'POST', body: JSON.stringify({ targetUserId }) },
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.conversation) {
        upsertConversationInCache(qc, data.conversation);
      }
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string; memberIds?: string[] }) => {
      const data = await apiFetch<{ conversation: Conversation }>('/api/groups', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.conversation) {
        upsertConversationInCache(qc, data.conversation);
      }
    },
  });
}

export function useUpdateGroup(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name?: string; description?: string; avatarUrl?: string | null }) => {
      const data = await apiFetch<{ conversation: Conversation }>(`/api/groups/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.conversation) patchConversationInCache(qc, data.conversation);
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useAddGroupMembers(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberIds: string[]) => {
      const data = await apiFetch<{ conversation: Conversation }>(
        `/api/groups/${conversationId}/members`,
        { method: 'POST', body: JSON.stringify({ memberIds }) },
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.conversation) patchConversationInCache(qc, data.conversation);
    },
  });
}

export function useUpdateMemberRole(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetUserId, role }: { targetUserId: string; role: string }) => {
      const data = await apiFetch<{ conversation: Conversation }>(
        `/api/groups/${conversationId}/members/${targetUserId}`,
        { method: 'PATCH', body: JSON.stringify({ role }) },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useRemoveGroupMember(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const data = await apiFetch(`/api/groups/${conversationId}/members/${targetUserId}`, {
        method: 'DELETE',
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
      qc.invalidateQueries({ queryKey: queryKeys.messages(conversationId || 'none') });
    },
  });
}

export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const data = await apiFetch(`/api/groups/${conversationId}/leave`, { method: 'POST' });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useClearConversation(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const data = await apiFetch(`/api/conversations/${conversationId}/clear`, { method: 'POST' });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messages(conversationId || 'none') });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const data = await apiFetch<{ user: User }>('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return data;
    },
    onSuccess: (data) => {
      setUser(data.user);
    },
  });
}

export function useUpdateSettings() {
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const data = await apiFetch<{ user: User }>('/api/users/me/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return data;
    },
    onSuccess: (data) => {
      setUser(data.user);
    },
  });
}

export function useUploadAttachment() {
  return useMutation({
    mutationFn: async (file: File) => uploadFileAttachment(file),
  });
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.notifications });

  const markRead = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => apiFetch('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate,
  });

  const deleteOne = useMutation({
    mutationFn: async (id: string) => apiFetch(`/api/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const deleteAll = useMutation({
    mutationFn: async () => apiFetch('/api/notifications', { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return { markRead, markAllRead, deleteOne, deleteAll };
}

export function useBlockUser() {
  return useMutation({
    mutationFn: async ({ userId, block }: { userId: string; block: boolean }) =>
      apiFetch(`/api/users/${userId}/block`, { method: block ? 'POST' : 'DELETE' }),
  });
}

/* --------------------------- cache patch helpers --------------------------- */

export function patchMessageInCache(qc: QueryClient, conversationId: string | null, message: Message | null) {
  if (!message) return;
  qc.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
    queryKeys.messages(conversationId || 'none'),
    (old) => {
      if (!old) return old;
      const pages = old.pages.map((page, pageIndex) => {
        const idx = page.messages.findIndex((m) => m.id === message.id);
        if (idx === -1) return page;
        const next = [...page.messages];
        next[idx] = { ...message, tempId: undefined, clientStatus: undefined };
        return { ...page, messages: next };
      });
      // Update pinned list (kept on the first page)
      if (pages.length > 0) {
        const first = pages[0];
        const pinIdx = first.pinnedMessages.findIndex((m) => m.id === message.id);
        if (pinIdx !== -1) {
          const pinned = [...first.pinnedMessages];
          pinned[pinIdx] = { ...message, tempId: undefined, clientStatus: undefined };
          pages[0] = { ...first, pinnedMessages: pinned };
        }
      }
      return { ...old, pages };
    },
  );
}

export function patchConversationInCache(qc: QueryClient, conversation: Conversation) {
  qc.setQueryData<Conversation[]>(queryKeys.conversations, (old) => {
    if (!old) return old;
    const idx = old.findIndex((c) => c.id === conversation.id);
    if (idx === -1) return [conversation, ...old];
    const next = [...old];
    next[idx] = conversation;
    return next;
  });
}

export function upsertConversationInCache(qc: QueryClient, conversation: Conversation) {
  qc.setQueryData<Conversation[]>(queryKeys.conversations, (old) => {
    const without = (old || []).filter((c) => c.id !== conversation.id);
    return [conversation, ...without];
  });
}

export function removeConversationFromCache(qc: QueryClient, conversationId: string) {
  qc.setQueryData<Conversation[]>(queryKeys.conversations, (old) =>
    (old || []).filter((c) => c.id !== conversationId),
  );
  qc.removeQueries({ queryKey: queryKeys.messages(conversationId) });
}
