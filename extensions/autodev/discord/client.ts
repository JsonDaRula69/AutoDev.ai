/**
 * Discord REST client — direct fetch() to Discord API.
 *
 * Features:
 *  - Rate limiting: max 5 requests per second (Discord API limit).
 *  - Reconnection: max 3 attempts with exponential backoff, then disable.
 *  - Methods: sendMessage(), getMessages(), getMessage().
 *
 * No @openclaw/discord dependency — uses fetch() directly.
 */

const DISCORD_API_BASE = "https://discord.com/api/v10";

/** Maximum requests per second (Discord rate limit). */
const MAX_RPS = 5;

/** Maximum reconnection attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Base delay for exponential backoff (ms). */
const BASE_BACKOFF_MS = 1_000;

/** Maximum backoff delay (ms). */
const MAX_BACKOFF_MS = 30_000;

/** A queued API request. */
interface QueuedRequest {
  readonly method: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  readonly path: string;
  readonly body?: unknown;
  readonly resolve: (value: Response) => void;
  readonly reject: (reason: unknown) => void;
}

/** Discord message object (subset of fields we care about). */
export interface DiscordMessage {
  readonly id: string;
  readonly channel_id: string;
  readonly content: string;
  readonly author: {
    readonly id: string;
    readonly username: string;
    readonly bot: boolean;
  };
  readonly timestamp: string;
  readonly referenced_message?: DiscordMessage | null;
}

/** Discord REST client. */
export class DiscordClient {
  private readonly token: string;
  private readonly queue: QueuedRequest[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private reconnectAttempts = 0;
  private disabled = false;

  constructor(token: string) {
    this.token = token;
  }

  /** Whether the client is disabled (after max reconnection failures). */
  get isDisabled(): boolean {
    return this.disabled;
  }

  /** Reset the reconnection counter (call after a successful request). */
  private resetReconnect(): void {
    this.reconnectAttempts = 0;
  }

  /**
   * Send a message to a Discord channel.
   * Returns the created message or null on failure.
   */
  async sendMessage(
    channelId: string,
    content: string,
    options?: { readonly replyTo?: string },
  ): Promise<DiscordMessage | null> {
    const body: Record<string, unknown> = { content };
    if (options?.replyTo) {
      body.message_reference = { message_id: options.replyTo };
    }
    let res: Response | null;
    try {
      res = await this.request("POST", `/channels/${channelId}/messages`, body);
    } catch {
      return null;
    }
    if (!res) return null;
    if (!res.ok) {
      console.warn(`[discord] sendMessage failed: ${res.status} ${await res.text().catch(() => "")}`);
      return null;
    }
    return (await res.json()) as DiscordMessage;
  }

  /**
   * Get messages from a channel (most recent first).
   * limit: max 100 (Discord API limit).
   */
  async getMessages(
    channelId: string,
    options?: { readonly limit?: number; readonly after?: string },
  ): Promise<DiscordMessage[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(Math.min(options.limit, 100)));
    if (options?.after) params.set("after", options.after);
    const qs = params.toString();
    let res: Response | null;
    try {
      res = await this.request("GET", `/channels/${channelId}/messages${qs ? `?${qs}` : ""}`);
    } catch {
      return [];
    }
    if (!res) return [];
    if (!res.ok) {
      console.warn(`[discord] getMessages failed: ${res.status}`);
      return [];
    }
    return (await res.json()) as DiscordMessage[];
  }

  /**
   * Get a single message by ID.
   */
  async getMessage(channelId: string, messageId: string): Promise<DiscordMessage | null> {
    let res: Response | null;
    try {
      res = await this.request("GET", `/channels/${channelId}/messages/${messageId}`);
    } catch {
      return null;
    }
    if (!res) return null;
    if (!res.ok) {
      console.warn(`[discord] getMessage failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as DiscordMessage;
  }

  /**
   * Internal: enqueue and process a request with rate limiting.
   * Returns null if the client is disabled.
   */
  private async request(
    method: QueuedRequest["method"],
    path: string,
    body?: unknown,
  ): Promise<Response | null> {
    if (this.disabled) return null;

    return new Promise<Response>((resolve, reject) => {
      this.queue.push({ method, path, body, resolve, reject });
      void this.processQueue();
    });
  }

  /** Process the queue with rate limiting (max 5 req/s). */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      if (this.disabled) {
        // Reject all queued requests.
        while (this.queue.length > 0) {
          const req = this.queue.shift()!;
          req.reject(new Error("Discord client is disabled"));
        }
        break;
      }

      // Rate limit: ensure at least 200ms between requests.
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      const minInterval = 1000 / MAX_RPS; // 200ms
      if (elapsed < minInterval) {
        await sleep(minInterval - elapsed);
      }

      const req = this.queue.shift()!;
      try {
        const response = await this.executeRequest(req.method, req.path, req.body);
        this.lastRequestTime = Date.now();
        this.resetReconnect();
        req.resolve(response);
      } catch (err) {
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          this.disabled = true;
          console.warn(
            `[discord] Disabled after ${MAX_RECONNECT_ATTEMPTS} failed reconnection attempts.`,
          );
          req.reject(err);
          // Reject remaining queued requests.
          while (this.queue.length > 0) {
            this.queue.shift()!.reject(new Error("Discord client disabled after max reconnection attempts"));
          }
          break;
        }
        const backoff = Math.min(
          BASE_BACKOFF_MS * Math.pow(2, this.reconnectAttempts - 1),
          MAX_BACKOFF_MS,
        );
        console.warn(
          `[discord] Request failed (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}), retrying in ${backoff}ms: ${err}`,
        );
        await sleep(backoff);
        // Re-queue the request.
        this.queue.unshift(req);
      }
    }

    this.processing = false;
  }

  /** Execute a single HTTP request to the Discord API. */
  private async executeRequest(
    method: QueuedRequest["method"],
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bot ${this.token}`,
      "Content-Type": "application/json",
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${DISCORD_API_BASE}${path}`, init);

    // Handle rate limit (HTTP 429).
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
      console.warn(`[discord] Rate limited, waiting ${waitMs}ms`);
      await sleep(waitMs);
      // Retry once after rate limit.
      return await fetch(`${DISCORD_API_BASE}${path}`, init);
    }

    return response;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
