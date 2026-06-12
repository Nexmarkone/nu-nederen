// WebSocket client: auto-reconnect with backoff, keep-alive pings, and
// immediate resync on visibilitychange/pageshow (Safari kills background
// sockets without telling anyone).

import { ServerMessageSchema, type ClientMessage, type ServerMessage } from "@nu/shared";

export type SocketStatus = "connecting" | "open" | "closed";

const PING_INTERVAL_MS = 20_000;

export interface SocketHandlers {
  onMessage(msg: ServerMessage): void;
  onStatus(status: SocketStatus): void;
  /** Called every time a fresh connection opens (rejoin + resync here). */
  onOpen(): void;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private backoff = 400;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;

  constructor(private readonly handlers: SocketHandlers) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.ensureOpen();
    });
    window.addEventListener("pageshow", () => this.ensureOpen());
    window.addEventListener("online", () => this.ensureOpen());
  }

  private url(): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/ws`;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.handlers.onStatus("connecting");
    const ws = new WebSocket(this.url());
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.backoff = 400;
      this.handlers.onStatus("open");
      this.startPing();
      this.handlers.onOpen();
    };

    ws.onmessage = (e) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const result = ServerMessageSchema.safeParse(parsed);
      if (result.success) this.handlers.onMessage(result.data);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      this.handlers.onStatus("closed");
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  /** Reconnect immediately if the socket is gone (used on visibility/pageshow). */
  ensureOpen(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Socket *looks* alive after backgrounding — ping to find out, and let
      // the store request a resync.
      this.send({ type: "ping", t: Date.now() });
      return;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.backoff = 400;
    this.connect();
  }

  send(msg: ClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 1.8, 6000);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ type: "ping", t: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
