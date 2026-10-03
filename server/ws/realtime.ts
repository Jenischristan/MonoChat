import type { RealtimeEvent } from '../../src/types/messaging';
import { getDb } from '../db/client';
import { conversationMembers, conversations, userBlocks, users, userSettings } from '../db/schema';
import { and, eq, or } from 'drizzle-orm';
import { getUserFromToken } from '../lib/auth';
import { getConversationForUser } from '../lib/hydrate';

import type { WebSocket as NodeWebSocket } from 'ws';

export interface WsData {
  userId: string | null;
  displayName: string | null;
  lastActivity: number;
}

export interface ServerWebSocketLike {
  data: WsData;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type BunServer = { upgrade(req: Request, options?: any): boolean };

const userSockets = new Map<string, Set<ServerWebSocketLike>>();

export async function tryUpgrade(req: Request, server?: BunServer): Promise<Response | undefined> {
  const url = new URL(req.url);
  if (url.pathname !== '/ws') return undefined;

  let userData: WsData = { userId: null, displayName: null, lastActivity: Date.now() };
  const token = url.searchParams.get('token');
  if (token) {
    const session = await getUserFromToken(token);
    if (session) {
      userData = { userId: session.user.id, displayName: session.user.displayName, lastActivity: Date.now() };
    }
  }

  if (server?.upgrade) {
    const success = server.upgrade(req, { data: userData });
    if (success) return undefined;
  }
  return new Response('WebSocket upgrade failed', { status: 400 });
}

export function handleNodeWebSocketConnection(ws: NodeWebSocket, initialToken?: string | null) {
  const socketData: WsData = {
    userId: null,
    displayName: null,
    lastActivity: Date.now(),
  };

  const socketLike: ServerWebSocketLike = {
    data: socketData,
    send(data: string) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    },
    close(code?: number, reason?: string) {
      try {
        ws.close(code, reason);
      } catch {
        // ignore
      }
    },
  };

  if (initialToken) {
    void (async () => {
      const session = await getUserFromToken(initialToken);
      if (session) {
        socketLike.data.userId = session.user.id;
        socketLike.data.displayName = session.user.displayName;
        await registerSocket(socketLike, session.user.id, session.user.displayName);
      }
    })();
  }

  ws.on('message', (raw) => {
    void websocketHandlers.message(socketLike, raw as any);
  });

  ws.on('close', () => {
    websocketHandlers.close(socketLike);
  });
}

export function getOnlineUserIds(): string[] {
  const activeIds = Array.from(userSockets.keys());
  if (activeIds.length === 0) return [];
  // Presence is filtered by the show_online_status preference
  return activeIds;
}

export async function getPublicOnlineUserIds(): Promise<string[]> {
  const activeIds = getOnlineUserIds();
  if (activeIds.length === 0) return [];
  const rows = await getDb()
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.showOnlineStatus, false));
  const hiddenSet = new Set(rows.map((r) => r.userId));
  return activeIds.filter((id) => !hiddenSet.has(id));
}

export function isUserConnected(userId: string): boolean {
  const set = userSockets.get(userId);
  return Boolean(set && set.size > 0);
}

export function broadcastToUser(userId: string, event: RealtimeEvent) {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;
  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    try {
      ws.send(payload);
    } catch {
      // Socket died between check and send
    }
  }
}

export function broadcastGlobal(event: RealtimeEvent) {
  const payload = JSON.stringify(event);
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {
        // ignore
      }
    }
  }
}

export async function broadcastToConversation(
  conversationId: string,
  event: RealtimeEvent,
  excludeUserId?: string,
) {
  const memberIds = await getConversationMemberIds(conversationId);
  for (const memberId of memberIds) {
    if (excludeUserId && memberId === excludeUserId) continue;
    broadcastToUser(memberId, event);
  }
}

export async function broadcastConversationUpdate(conversationId: string) {
  const memberIds = await getConversationMemberIds(conversationId);
  for (const memberId of memberIds) {
    const conv = await getConversationForUser(conversationId, memberId);
    if (conv) {
      broadcastToUser(memberId, { type: 'conversation:updated', conversation: conv });
    }
  }
}

async function getConversationMemberIds(conversationId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

export async function registerSocket(ws: ServerWebSocketLike, userId: string, displayName: string) {
  ws.data.userId = userId;
  ws.data.displayName = displayName;

  let set = userSockets.get(userId);
  const wasOffline = !set || set.size === 0;
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  set.add(ws);

  const now = new Date().toISOString();
  await getDb().update(users).set({ isOnline: true, lastSeenAt: now }).where(eq(users.id, userId));

  ws.send(
    JSON.stringify({
      type: 'init',
      onlineUserIds: await getPublicOnlineUserIds(),
    } satisfies RealtimeEvent),
  );

  const prefRows = await getDb()
    .select({ showOnlineStatus: userSettings.showOnlineStatus })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const isPublicPresence = prefRows[0] ? Boolean(prefRows[0].showOnlineStatus) : true;

  if (wasOffline && isPublicPresence) {
    broadcastGlobal({ type: 'presence:update', userId, isOnline: true, lastSeenAt: now });
  }
}

export async function unregisterSocket(ws: ServerWebSocketLike) {
  const userId = ws.data.userId;
  if (!userId) return;
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    userSockets.delete(userId);
    const now = new Date().toISOString();
    await getDb().update(users).set({ isOnline: false, lastSeenAt: now }).where(eq(users.id, userId));
    const prefRows = await getDb()
      .select({ showOnlineStatus: userSettings.showOnlineStatus })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const isPublicPresence = prefRows[0] ? Boolean(prefRows[0].showOnlineStatus) : true;
    if (isPublicPresence) {
      broadcastGlobal({ type: 'presence:update', userId, isOnline: false, lastSeenAt: now });
    }
  }
}

/** Bun.serve websocket handlers */
export const websocketHandlers = {
  open(ws: ServerWebSocketLike) {
    ws.data.lastActivity = Date.now();
    if (ws.data.userId) {
      void registerSocket(ws, ws.data.userId, ws.data.displayName || 'Someone');
    }
  },

  async message(ws: ServerWebSocketLike, rawMessage: string | Buffer) {
    ws.data.lastActivity = Date.now();
    let msg: any;
    try {
      msg = JSON.parse(typeof rawMessage === 'string' ? rawMessage : rawMessage.toString());
    } catch {
      return; // Ignore malformed JSON frames
    }

    if (msg.type === 'auth' && typeof msg.token === 'string') {
      const sessionData = await getUserFromToken(msg.token);
      if (sessionData) {
        await registerSocket(ws, sessionData.user.id, sessionData.user.displayName);
      }
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (!ws.data.userId) return;
    const userId = ws.data.userId;

    if (
      (msg.type === 'typing:start' || msg.type === 'typing:stop') &&
      typeof msg.conversationId === 'string'
    ) {
      const convId = msg.conversationId;
      const db = getDb();
      const memberRows = await db
        .select({ id: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, convId))
        .limit(50);
      const isMember = memberRows.some((r) => r.id === userId);
      if (!isMember) return;

      const convRows = await db
        .select({ type: conversations.type })
        .from(conversations)
        .where(eq(conversations.id, convId))
        .limit(1);
      if (convRows[0]?.type === 'direct') {
        const others = await db
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(eq(conversationMembers.conversationId, convId));
        const otherMember = others.find((o) => o.userId !== userId);
        if (otherMember) {
          const isBlocked = await db
            .select({ blockerId: userBlocks.blockerId })
            .from(userBlocks)
            .where(
              or(
                and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, otherMember.userId)),
                and(eq(userBlocks.blockerId, otherMember.userId), eq(userBlocks.blockedId, userId)),
              ),
            )
            .limit(1);
          if (isBlocked.length > 0) return;
        }
      }

      const isTyping = msg.type === 'typing:start';
      await broadcastToConversation(
        convId,
        {
          type: 'typing:update',
          conversationId: convId,
          userId,
          displayName: ws.data.displayName || 'Someone',
          isTyping,
        },
        userId,
      );
    }
  },

  close(ws: ServerWebSocketLike) {
    void unregisterSocket(ws);
  },

  // Bun handles protocol-level pings automatically; sweep dead sockets periodically.
  perMessageDeflate: false as const,
};

// Periodic sweep of idle sockets (no frames for 90s → force close; close handler cleans up)
const IDLE_TIMEOUT_MS = 90_000;
setInterval(() => {
  const now = Date.now();
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      if (now - ws.data.lastActivity > IDLE_TIMEOUT_MS) {
        try {
          ws.close(4000, 'Idle timeout');
        } catch {
          // ignore
        }
      }
    }
  }
}, 30_000);
