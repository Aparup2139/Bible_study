import type { WSEvent, WSEventType } from '../types';

type WSListener<T = unknown> = (event: WSEvent<T>) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners = new Map<WSEventType, Set<WSListener>>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly maxReconnectDelay = 30_000;
  private reconnectAttempts = 0;
  private url = '';

  connect(url: string): void {
    this.url = url;
    this.reconnectAttempts = 0;
    this.open();
  }

  private open(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('[WS] Connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSEvent;
          this.dispatch(data);
        } catch {
          console.warn('[WS] Unparseable message', event.data);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected — scheduling reconnect');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Error', err);
      };
    } catch (err) {
      console.error('[WS] Failed to open', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => this.open(), delay);
  }

  disconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.ws = null;
  }

  send<T>(event: WSEvent<T>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  on<T>(type: WSEventType, listener: WSListener<T>): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener as WSListener);
    return () => this.off(type, listener as WSListener);
  }

  off(type: WSEventType, listener: WSListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  private dispatch(event: WSEvent): void {
    this.listeners.get(event.type)?.forEach((fn) => fn(event));
  }
}

// Singleton instance shared across the app
export const wsService = new WebSocketService();
