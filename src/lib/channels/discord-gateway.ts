import { discordRequest, type DiscordGatewayEvent } from "@/lib/channels/discord";
import { log } from "@/lib/logger";

/** Direct messages only. DM text needs no privileged intent, and button taps arrive without one. */
const INTENTS = 1 << 12;

/** Close codes where reconnecting can't help: bad token, bad or unapproved intents, bad shard setup. */
const FATAL: Record<number, string> = {
  4004: "Discord rejected the bot token",
  4010: "Discord rejected the shard settings",
  4011: "This bot needs sharding, which Recatch doesn't do",
  4012: "Discord rejected the gateway version",
  4013: "Discord rejected the intents Recatch asked for",
  4014: "The bot isn't allowed the intents Recatch asked for",
};

/** Close codes after which the old session can't be resumed, so the next connect identifies fresh. */
const SESSION_LOST = new Set([1000, 1001, 4007, 4009]);

export type GatewayStatus = "connecting" | "connected" | "error";

/** The slice of the WebSocket API the client uses, so tests can drop in a fake. */
export type SocketLike = {
  send(data: string): void;
  close(code?: number): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
};

type Frame = { op: number; d?: unknown; s?: number | null; t?: string | null };

export type GatewayOptions = {
  token: string;
  onEvent: (event: DiscordGatewayEvent) => void;
  onStatus?: (status: GatewayStatus, error?: string | null) => void;
  /** Tests pass a fake socket and skip the gateway lookup. */
  createSocket?: (url: string) => SocketLike;
  gatewayUrl?: string;
};

/**
 * One bot's connection to Discord's Gateway: identify, heartbeat, resume after a drop, and hand
 * direct messages and button taps to `onEvent`. It reconnects on its own until `stop()`.
 */
export class DiscordGateway {
  private socket: SocketLike | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private heartbeatStart: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private acked = true;
  private seq: number | null = null;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private attempts = 0;
  private stopped = false;
  private url: string | null;

  constructor(private readonly options: GatewayOptions) {
    this.url = options.gatewayUrl ?? null;
  }

  async start() {
    this.stopped = false;
    await this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
  }

  private clearTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.heartbeatStart) clearTimeout(this.heartbeatStart);
    if (this.retry) clearTimeout(this.retry);
    this.heartbeat = this.heartbeatStart = this.retry = null;
  }

  private async connect() {
    if (this.stopped) return;
    this.options.onStatus?.("connecting");
    try {
      if (!this.url) {
        const info = await discordRequest<{ url: string }>(this.options.token, "GET", "/gateway/bot");
        this.url = info.url;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reach Discord";
      // A bad token fails here too, and retrying won't fix it.
      if (/401|unauthorized/i.test(message)) return this.fail("Discord rejected the bot token");
      return this.reconnect(message);
    }
    if (this.stopped) return;
    const base = this.sessionId && this.resumeUrl ? this.resumeUrl : this.url;
    const socket = (this.options.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike))(`${base}?v=10&encoding=json`);
    this.socket = socket;
    socket.onmessage = (event) => this.onFrame(socket, event.data);
    socket.onclose = (event) => this.onClose(socket, event.code);
    socket.onerror = () => undefined;
  }

  private onFrame(socket: SocketLike, raw: unknown) {
    if (socket !== this.socket) return;
    let frame: Frame;
    try {
      frame = JSON.parse(String(raw)) as Frame;
    } catch {
      return;
    }
    if (typeof frame.s === "number") this.seq = frame.s;

    switch (frame.op) {
      case 10: {
        const interval = (frame.d as { heartbeat_interval: number }).heartbeat_interval;
        this.startHeartbeat(socket, interval);
        if (this.sessionId) {
          this.send(socket, 6, { token: this.options.token, session_id: this.sessionId, seq: this.seq });
        } else {
          this.send(socket, 2, {
            token: this.options.token,
            intents: INTENTS,
            properties: { os: "linux", browser: "relay", device: "relay" },
          });
        }
        break;
      }
      case 11:
        this.acked = true;
        break;
      case 1:
        this.send(socket, 1, this.seq);
        break;
      case 7:
        // Discord asks us to reconnect; the session stays resumable.
        socket.close(4000);
        break;
      case 9:
        if (!frame.d) {
          this.sessionId = null;
          this.seq = null;
        }
        // Discord wants a pause of one to five seconds before trying again.
        this.reconnectIn(1000 + Math.floor(Math.random() * 4000), socket);
        break;
      case 0:
        this.onDispatch(frame);
        break;
    }
  }

  private onDispatch(frame: Frame) {
    const data = frame.d as Record<string, unknown>;
    if (frame.t === "READY") {
      this.sessionId = String(data.session_id);
      this.resumeUrl = typeof data.resume_gateway_url === "string" ? data.resume_gateway_url : null;
      this.attempts = 0;
      this.options.onStatus?.("connected");
    } else if (frame.t === "RESUMED") {
      this.attempts = 0;
      this.options.onStatus?.("connected");
    } else if (frame.t === "MESSAGE_CREATE" || frame.t === "INTERACTION_CREATE") {
      this.options.onEvent({ t: frame.t, d: data } as DiscordGatewayEvent);
    }
  }

  private startHeartbeat(socket: SocketLike, interval: number) {
    this.clearTimers();
    this.acked = true;
    const beat = () => {
      if (socket !== this.socket) return;
      // No acknowledgement since the last beat means the connection is dead; drop it and resume.
      if (!this.acked) return socket.close(4000);
      this.acked = false;
      this.send(socket, 1, this.seq);
    };
    this.heartbeatStart = setTimeout(() => {
      beat();
      this.heartbeat = setInterval(beat, interval);
    }, Math.floor(interval * Math.random()));
  }

  private send(socket: SocketLike, op: number, d: unknown) {
    socket.send(JSON.stringify({ op, d }));
  }

  private onClose(socket: SocketLike, code: number) {
    if (socket !== this.socket) return;
    this.socket = null;
    this.clearTimers();
    if (this.stopped) return;
    if (FATAL[code]) return this.fail(FATAL[code]);
    if (SESSION_LOST.has(code)) {
      this.sessionId = null;
      this.seq = null;
    }
    this.reconnect(`Connection closed (${code})`);
  }

  private fail(message: string) {
    this.stopped = true;
    this.clearTimers();
    log.warn("Discord gateway stopped", message);
    this.options.onStatus?.("error", message);
  }

  /** Back off 1s, 2s, 4s... up to 30s, so a Discord outage doesn't turn into a reconnect storm. */
  private reconnect(reason: string) {
    this.options.onStatus?.("connecting", reason);
    this.reconnectIn(Math.min(1000 * 2 ** this.attempts, 30_000));
    this.attempts += 1;
  }

  private reconnectIn(ms: number, socket?: SocketLike) {
    if (this.stopped) return;
    if (socket && socket === this.socket) {
      this.socket = null;
      this.clearTimers();
      socket.close(4000);
    }
    this.retry = setTimeout(() => void this.connect(), ms);
  }
}
