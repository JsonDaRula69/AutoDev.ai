/**
 * Discord Gateway client — WebSocket connection for real-time events.
 *
 * Connects to the Discord Gateway to receive events (MESSAGE_CREATE, etc.)
 * and maintain "online" presence. The REST client handles API calls;
 * the Gateway client handles real-time event streaming.
 */

export type GatewayEvent = {
  t: string | null;
  s: number | null;
  op: number;
  d: unknown;
};

export type MessageHandler = (message: {
  id: string;
  channel_id: string;
  content: string;
  author: { id: string; username: string; bot: boolean };
  referenced_message?: { id: string } | null;
}) => void;

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

export class DiscordGateway {
  private ws: WebSocket | null = null;
  private token: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval = 41_250;
  private sequence: number | null = null;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private messageHandlers: MessageHandler[] = [];
  private stopped = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;

  constructor(token: string) {
    this.token = token;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      this.ws = new WebSocket(GATEWAY_URL);
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
      };
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as GatewayEvent;
          this.handleGatewayEvent(data);
        } catch {
          // ignore parse errors
        }
      };
      this.ws.onclose = () => {
        if (!this.stopped) this.scheduleReconnect();
      };
      this.ws.onerror = () => {
        // errors handled by onclose
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private handleGatewayEvent(event: GatewayEvent): void {
    switch (event.op) {
      case 10: {
        const d = event.d as { heartbeat_interval: number };
        this.heartbeatInterval = d.heartbeat_interval;
        this.sendIdentify();
        this.startHeartbeat();
        break;
      }
      case 0: {
        this.sequence = event.s;
        if (event.t === "READY") {
          const d = event.d as { session_id: string; resume_gateway_url: string };
          this.sessionId = d.session_id;
          this.resumeUrl = d.resume_gateway_url;
          console.log("[discord] Gateway connected — bot is online.");
        }
        if (event.t === "MESSAGE_CREATE") {
          const d = event.d as {
            id: string;
            channel_id: string;
            content: string;
            author: { id: string; username: string; bot: boolean };
            referenced_message?: { id: string } | null;
          };
          for (const handler of this.messageHandlers) {
            handler(d);
          }
        }
        break;
      }
      case 11: {
        break;
      }
      case 1: {
        this.sendHeartbeat();
        break;
      }
    }
  }

  private sendIdentify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        intents: (1 << 9) | (1 << 15),
        properties: {
          os: "linux",
          browser: "autodev",
          device: "autodev",
        },
      },
    }));
  }

  private sendHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      op: 1,
      d: this.sequence,
    }));
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.reconnectAttempts++;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`[discord] Gateway: max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, delay);
  }

  disconnect(): void {
    this.stopped = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}