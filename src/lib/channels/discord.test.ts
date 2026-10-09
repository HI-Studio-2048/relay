import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDiscordMessage, discordEventId, parseDiscordEvent, type DiscordGatewayEvent } from "@/lib/channels/discord";
import { DiscordGateway, type SocketLike } from "@/lib/channels/discord-gateway";
import type { OutboundReply } from "@/lib/types";

const reply = (over: Partial<OutboundReply>): OutboundReply => ({ text: "", source: "flow", ...over });

describe("Discord messages", () => {
  it("sends plain text", () => {
    expect(buildDiscordMessage(reply({ text: "Hi there" }))).toEqual({ content: "Hi there" });
  });

  it("turns buttons into link and callback buttons in one row", () => {
    const body = buildDiscordMessage(
      reply({
        text: "Pick one",
        buttons: [
          { text: "Pricing", url: "https://example.com/pricing" },
          { text: "Talk to us", data: "n:abc" },
        ],
      }),
    );
    expect(body.components).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "Pricing", url: "https://example.com/pricing" },
          { type: 2, style: 1, label: "Talk to us", custom_id: "n:abc" },
        ],
      },
    ]);
  });

  it("makes quick replies buttons that carry their title", () => {
    const body = buildDiscordMessage(reply({ text: "Size?", keyboard: ["Small", "Large"] }));
    const ids = (body.components?.[0] as { components: { custom_id: string }[] }).components.map((c) => c.custom_id);
    expect(ids).toEqual(["qr:Small", "qr:Large"]);
  });

  it("splits more than five buttons into rows and stops at five rows", () => {
    const buttons = Array.from({ length: 30 }, (_, i) => ({ text: `B${i}`, data: `n:${i}` }));
    const body = buildDiscordMessage(reply({ text: "Many", buttons }));
    expect(body.components).toHaveLength(5);
    expect((body.components?.[4] as { components: unknown[] }).components).toHaveLength(5);
  });

  it("clips text to Discord's 2000 character limit", () => {
    const body = buildDiscordMessage(reply({ text: "a".repeat(2500) }));
    expect(body.content).toHaveLength(2000);
    expect(body.content?.endsWith("…")).toBe(true);
  });

  it("never sends an empty message", () => {
    expect(buildDiscordMessage(reply({ text: "" })).content).toBeTruthy();
    expect(buildDiscordMessage(reply({ text: "", buttons: [{ text: "Go", data: "n:1" }] })).content).toBe("Choose an option");
  });

  it("attaches an image as an embed", () => {
    const body = buildDiscordMessage(reply({ text: "Look", media: { url: "https://cdn.example.com/a.png", kind: "photo" } }));
    expect(body.embeds).toEqual([{ image: { url: "https://cdn.example.com/a.png" } }]);
  });
});

describe("Discord events", () => {
  const dm = (over: Record<string, unknown> = {}): DiscordGatewayEvent => ({
    t: "MESSAGE_CREATE",
    d: { id: "m1", content: "hello", author: { id: "42", username: "ada", global_name: "Ada Lovelace", avatar: "abc" }, ...over },
  });

  it("reads a direct message", () => {
    const [event] = parseDiscordEvent(dm());
    expect(event).toMatchObject({
      externalUserId: "42",
      username: "ada",
      firstName: "Ada",
      lastName: "Lovelace",
      text: "hello",
      externalMessageId: "m1",
      avatarUrl: "https://cdn.discordapp.com/avatars/42/abc.png?size=128",
    });
  });

  it("ignores server messages, bots and empty events", () => {
    expect(parseDiscordEvent(dm({ guild_id: "g1" }))).toEqual([]);
    expect(parseDiscordEvent(dm({ author: { id: "9", username: "bot", bot: true } }))).toEqual([]);
    expect(parseDiscordEvent({ t: "MESSAGE_CREATE" } as DiscordGatewayEvent)).toEqual([]);
  });

  it("labels attachment-only messages", () => {
    expect(parseDiscordEvent(dm({ content: "", attachments: [{}] }))[0].text).toBe("[attachment]");
  });

  it("reads a flow button tap and keeps what's needed to acknowledge it", () => {
    const [event] = parseDiscordEvent({
      t: "INTERACTION_CREATE",
      d: { id: "i1", token: "tok", type: 3, user: { id: "42", username: "ada" }, data: { custom_id: "n:abc" } },
    });
    expect(event).toMatchObject({ externalUserId: "42", callbackData: "n:abc", ackCallbackId: "i1:tok" });
  });

  it("reads a quick reply tap as typed text", () => {
    const [event] = parseDiscordEvent({
      t: "INTERACTION_CREATE",
      d: { id: "i2", token: "tok", type: 3, member: { user: { id: "42", username: "ada" } }, data: { custom_id: "qr:Large" } },
    });
    expect(event).toMatchObject({ text: "Large", callbackData: null });
  });

  it("ignores interactions that aren't button taps", () => {
    expect(parseDiscordEvent({ t: "INTERACTION_CREATE", d: { id: "i3", type: 2, user: { id: "1" } } })).toEqual([]);
  });

  it("builds a de-duplication id from the event name and id", () => {
    expect(discordEventId(dm())).toBe("MESSAGE_CREATE:m1");
    expect(discordEventId({ t: "MESSAGE_CREATE" } as DiscordGatewayEvent)).toBeNull();
  });
});

class FakeSocket implements SocketLike {
  sent: { op: number; d: unknown }[] = [];
  closed: number | null = null;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code = 1000) {
    this.closed = code;
    this.onclose?.({ code });
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  serverClose(code: number) {
    this.onclose?.({ code });
  }
}

describe("Discord gateway", () => {
  let sockets: FakeSocket[];
  let urls: string[];
  let events: DiscordGatewayEvent[];
  let statuses: [string, string | null | undefined][];

  const make = () =>
    new DiscordGateway({
      token: "secret",
      gatewayUrl: "wss://gateway.test",
      onEvent: (event) => events.push(event),
      onStatus: (status, error) => statuses.push([status, error]),
      createSocket: (url) => {
        urls.push(url);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

  const hello = (socket: FakeSocket) => socket.receive({ op: 10, d: { heartbeat_interval: 40_000 } });
  const ready = (socket: FakeSocket) =>
    socket.receive({ op: 0, s: 1, t: "READY", d: { session_id: "sess", resume_gateway_url: "wss://resume.test" } });

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    urls = [];
    events = [];
    statuses = [];
  });
  afterEach(() => vi.useRealTimers());

  it("identifies for direct messages after hello and reports connected on ready", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    expect(sockets[0].sent[0]).toMatchObject({ op: 2, d: { token: "secret", intents: 1 << 12 } });
    ready(sockets[0]);
    expect(statuses.at(-1)?.[0]).toBe("connected");
    expect(urls[0]).toBe("wss://gateway.test?v=10&encoding=json");
    gateway.stop();
  });

  it("passes messages and button taps on, and nothing else", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    ready(sockets[0]);
    sockets[0].receive({ op: 0, s: 2, t: "MESSAGE_CREATE", d: { id: "m1", content: "hi" } });
    sockets[0].receive({ op: 0, s: 3, t: "TYPING_START", d: {} });
    expect(events.map((event) => event.t)).toEqual(["MESSAGE_CREATE"]);
    gateway.stop();
  });

  it("heartbeats with the latest sequence number", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    ready(sockets[0]);
    await vi.advanceTimersByTimeAsync(40_000);
    const beats = sockets[0].sent.filter((frame) => frame.op === 1);
    expect(beats.length).toBeGreaterThan(0);
    expect(beats[0].d).toBe(1);
    gateway.stop();
  });

  it("resumes the session on the resume address after a dropped connection", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    ready(sockets[0]);
    sockets[0].serverClose(1006);
    await vi.advanceTimersByTimeAsync(1000);
    expect(urls[1]).toBe("wss://resume.test?v=10&encoding=json");
    hello(sockets[1]);
    expect(sockets[1].sent[0]).toMatchObject({ op: 6, d: { token: "secret", session_id: "sess", seq: 1 } });
    gateway.stop();
  });

  it("starts a fresh session when Discord says the old one is gone", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    ready(sockets[0]);
    sockets[0].serverClose(4007);
    await vi.advanceTimersByTimeAsync(1000);
    hello(sockets[1]);
    expect(sockets[1].sent[0].op).toBe(2);
    gateway.stop();
  });

  it("stops for good on a rejected token", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    sockets[0].serverClose(4004);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    expect(statuses.at(-1)).toEqual(["error", "Discord rejected the bot token"]);
  });

  it("stops for good when the intents are refused", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    sockets[0].serverClose(4014);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    expect(statuses.at(-1)?.[0]).toBe("error");
  });

  it("backs off between repeated failures", async () => {
    const gateway = make();
    await gateway.start();
    sockets[0].serverClose(1006);
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    sockets[1].serverClose(1006);
    await vi.advanceTimersByTimeAsync(1999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
    gateway.stop();
  });

  it("reconnects when Discord asks for it and when heartbeats go unanswered", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    ready(sockets[0]);
    sockets[0].receive({ op: 7 });
    expect(sockets[0].closed).toBe(4000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);

    hello(sockets[1]);
    // Two beats with no acknowledgement in between: the second one finds the link dead.
    await vi.advanceTimersByTimeAsync(40_000 * 2 + 1);
    expect(sockets[1].closed).toBe(4000);
    gateway.stop();
  });

  it("does not reconnect after stop", async () => {
    const gateway = make();
    await gateway.start();
    hello(sockets[0]);
    gateway.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
  });
});
