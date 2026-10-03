import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { realtime } from '../lib/ws';
import type { Conversation, Message, RealtimeEvent } from '../types/messaging';
import {
  patchConversationInCache,
  patchMessageInCache,
  queryKeys,
  reconcileTempMessage,
  removeConversationFromCache,
  upsertConversationInCache,
  type MessagesPage,
} from './hooks';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';

/**
 * Subscribes the app to the realtime gateway and mirrors every event into the
 * TanStack Query cache + client stores. Mount once inside the authenticated area.
 */
export function useRealtimeBridge(activeConversationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    realtime.connect();
    const unsubscribe = realtime.addListener((event) => {
      handleRealtimeEvent(qc, event, activeConversationId);
    });
    return () => {
      unsubscribe();
      realtime.disconnect();
    };
  }, [qc, activeConversationId]);
}

function handleRealtimeEvent(
  qc: QueryClient,
  event: RealtimeEvent,
  activeConversationId: string | null,
) {
  const chat = useChatStore.getState();
  const currentUser = useAuthStore.getState().user;
  const ui = useUIStore.getState();

  switch (event.type) {
    case 'init': {
      chat.setOnlineUserIds(event.onlineUserIds);
      break;
    }

    case 'presence:update': {
      if (event.isOnline) {
        chat.addOnlineUser(event.userId);
      } else {
        chat.removeOnlineUser(event.userId);
      }
      break;
    }

    case 'typing:update': {
      chat.setTyping(
        event.conversationId,
        event.isTyping
          ? { userId: event.userId, displayName: event.displayName }
          : null,
      );
      break;
    }

    case 'message:new': {
      const message = event.message;

      // Reconcile optimistic send
      if (event.tempId) {
        reconcileTempMessage(qc, event.conversationId, event.tempId, message, 'sent');
      } else if (message.senderId !== currentUser?.id) {
        appendMessageToCache(qc, event.conversationId, message);
      } else {
        appendMessageToCache(qc, event.conversationId, message);
      }

      // Update conversation preview + unread badge
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
      if (
        message.senderId !== currentUser?.id &&
        event.conversationId !== activeConversationId &&
        !document.hasFocus()
        // unread badge is derived from the refetch above
      ) {
        // noop — refetch handles the badge
      }
      break;
    }

    case 'message:edited':
    case 'message:updated': {
      patchMessageInCache(qc, activeConversationId, event.message);
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
      break;
    }

    case 'message:deleted': {
      if (event.message) {
        patchMessageInCache(qc, activeConversationId, event.message);
      } else if (event.messageId) {
        qc.invalidateQueries({ queryKey: queryKeys.messages(activeConversationId || 'none') });
      }
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
      break;
    }

    case 'message:reaction': {
      if (event.message) {
        patchMessageInCache(qc, activeConversationId, event.message);
      } else if (event.messageId) {
        qc.invalidateQueries({ queryKey: queryKeys.messages(activeConversationId || 'none') });
      }
      break;
    }

    case 'message:pinned': {
      qc.invalidateQueries({ queryKey: queryKeys.messages(activeConversationId || 'none') });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
      break;
    }

    case 'conversation:read': {
      updateReadReceipts(qc, activeConversationId, event.userId, event.lastReadMessageId);
      break;
    }

    case 'conversation:created': {
      upsertConversationInCache(qc, event.conversation);
      break;
    }

    case 'conversation:updated': {
      patchConversationInCache(qc, event.conversation);
      break;
    }

    case 'conversation:cleared': {
      qc.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        queryKeys.messages(activeConversationId || 'none'),
        (old) => {
          if (!old) return old;
          const pages = old.pages.map((page) => ({ ...page, messages: [], pinnedMessages: [] }));
          return { ...old, pages };
        },
      );
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
      break;
    }

    case 'group:member_removed': {
      if (event.userId === currentUser?.id) {
        removeConversationFromCache(qc, event.conversationId);
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.conversations });
      }
      break;
    }

    case 'notification:new': {
      qc.setQueryData<{ notifications: any[]; unreadCount: number }>(
        queryKeys.notifications,
        (old) => {
          const list = old ? [event.notification, ...old.notifications] : [event.notification];
          return {
            notifications: list.slice(0, 100),
            unreadCount: list.filter((n) => !n.isRead).length,
          };
        },
      );
      if (!event.notification.isRead && useAuthStore.getState().user?.settings?.notificationsEnabled !== false) {
        ui.pushToast({
          kind: 'info',
          title: event.notification.title,
          body: event.notification.body,
        });
      }
      break;
    }

    default:
      break;
  }
}

function appendMessageToCache(qc: QueryClient, conversationId: string, message: Message) {
  qc.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
    queryKeys.messages(conversationId),
    (old) => {
      if (!old) return old;
      const pages = [...old.pages];
      // Dedupe (already exists — e.g. reconciled optimistic message)
      const exists = pages.some((p) => p.messages.some((m) => m.id === message.id));
      if (exists) {
        return patchInPages(old, message);
      }
      pages[pages.length - 1] = {
        ...pages[pages.length - 1],
        messages: [...pages[pages.length - 1].messages, message],
      };
      return { ...old, pages };
    },
  );
}

function patchInPages(
  old: { pages: MessagesPage[]; pageParams: unknown[] },
  message: Message,
): { pages: MessagesPage[]; pageParams: unknown[] } {
  const pages = old.pages.map((page) => {
    const idx = page.messages.findIndex((m) => m.id === message.id);
    if (idx === -1) return page;
    const next = [...page.messages];
    next[idx] = message;
    return { ...page, messages: next };
  });
  return { ...old, pages };
}

function updateReadReceipts(
  qc: QueryClient,
  conversationId: string | null,
  userId: string,
  lastReadMessageId: string,
) {
  qc.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
    queryKeys.messages(conversationId || 'none'),
    (old) => {
      if (!old) return old;
      const reader = useAuthStore.getState().user;
      void reader;
      let readUserInfo: { userId: string; displayName: string; username: string; avatarUrl: string | null } | null =
        null;

      // Locate the reader info from conversation members
      const conversations = qc.getQueryData<Conversation[]>(queryKeys.conversations) || [];
      const conv = conversations.find((c) => c.id === conversationId);
      const member = conv?.members.find((m) => m.userId === userId);
      if (member) {
        readUserInfo = {
          userId: member.userId,
          displayName: member.displayName,
          username: member.username,
          avatarUrl: member.avatarUrl,
        };
      }
      if (!readUserInfo) return old;

      const readAt = new Date().toISOString();
      const pageIndex = old.pages.findIndex((page) =>
        page.messages.some((m) => m.id === lastReadMessageId),
      );
      if (pageIndex === -1) return old;

      const pages = old.pages.map((page, i) => {
        if (i > pageIndex) return page;
        const messages = page.messages.map((m) => {
          // The reader (userId) doesn't leave receipts on their own messages
          if (m.senderId === userId || m.readBy.some((r) => r.userId === userId)) {
            return m;
          }
          return {
            ...m,
            readBy: [
              ...m.readBy.filter((r) => r.userId !== userId),
              { ...readUserInfo!, readAt },
            ],
          };
        });
        return { ...page, messages };
      });
      return { ...old, pages };
    },
  );
}
