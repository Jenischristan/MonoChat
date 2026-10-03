import type { RealtimeEvent } from '../types/messaging';
import { getStoredToken } from './api';

type EventListener = (event: RealtimeEvent) => void;

/**
 * Realtime WebSocket client for the /ws gateway.
 * Auto-reconnects with exponential backoff, re-authenticates with the stored
 * session token, and answers app-level keep-alive pings.
 */
class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<EventListener>();
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private deliberatelyClosed = false;

  connect() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    if (!getStoredToken()) return;
    this.deliberatelyClosed = false;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(getStoredToken()!)}`;

    try {
      this.socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.startPing();
    };

    this.socket.onmessage = (raw) => {
      try {
        const event = JSON.parse(raw.data);
        if (event.type === 'pong') return;
        this.listeners.forEach((listener) => listener(event as RealtimeEvent));
      } catch {
        // Ignore malformed frames
      }
    };

    this.socket.onclose = () => {
      this.stopPing();
      this.socket = null;
      if (!this.deliberatelyClosed) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      try {
        this.socket?.close();
      } catch {
        // ignore
      }
    };
  }

  disconnect() {
    this.deliberatelyClosed = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
    this.socket = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** Math.min(this.reconnectAttempts - 1, 5), 15000);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ type: 'ping' } as any);
    }, 25000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  send(event: Record<string, unknown>) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }

  sendTyping(conversationId: string, isTyping: boolean) {
    this.send({ type: isTyping ? 'typing:start' : 'typing:stop', conversationId });
  }

  addListener(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isConnected(): boolean {
    return Boolean(this.socket && this.socket.readyState === WebSocket.OPEN);
  }
}

export const realtime = new RealtimeClient();
