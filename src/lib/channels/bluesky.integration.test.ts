import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Call = { host: string; nsid: string; method: string; body: Record<string, unknown>; query: URLSearchParams; auth: string | null; proxy: string | null };
const calls: Call[] = [];
const realFetch = globalThis.fetch;

const PASSWORD = "abcd-efgh-ijkl-mnop";
const ME = "did:plc:me";
const jwt = (expSeconds: number) => `x.${Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url")}.y`;

/** What the fake Bluesky chat log holds, and the switches the tests flip. */
const world = {
  logs: [] as { rev: string; entry: Record<string, unknown> }[],
  dmScope: true,
  expireNextChatCall: false,
  sessions: 0,
};

const incoming = (rev: string, id: string, text: string, did = "did:plc:ada") => ({
  rev,
  entry: { $type: "chat.bsky.convo.defs#logCreateMessage", convoId: "convo-1", rev, message: { $type: "chat.bsky.convo.defs#messageView", id, text, sender: { did } } },
});

/** A stand-in for bsky.social and the public API: enough to sign in, read the chat log and reply. */
function fakeBluesky() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!["bsky.social", "pds.example.test", "public.api.bsky.app"].includes(url.host)) return realFetch(input, init);
    const headers = new Headers(init?.headers);
    const nsid = url.pathname.replace("/xrpc/", "");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ host: url.host, nsid, method: init?.method ?? "GET", body, query: url.searchParams, auth: headers.get("authorization"), proxy: headers.get("atproto-proxy") });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

    if (nsid === "com.atproto.server.createSession") {
      if (body.password !== PASSWORD) return reply({ error: "AuthenticationRequired", message: "Invalid identifier or password" }, 401);
      world.sessions++;
      return reply({ accessJwt: jwt(Math.floor(Date.now() / 1000) + 7200), refreshJwt: jwt(Math.floor(Date.now() / 1000) + 86400), did: ME, handle: "recatch.bsky.social", didDoc: { service: [{ id: "#atproto_pds", serviceEndpoint: "https://pds.example.test" }] } });
    }
    if (nsid === "app.bsky.actor.getProfile") return reply({ handle: "ada.bsky.social", displayName: "Ada Lovelace" });
    if (!nsid.startsWith("chat.bsky.")) return reply({ error: "MethodNotImplemented" }, 501);
    // The sign-in entryway does not forward chat; only the account's own server does.
    if (url.host !== "pds.example.test") return reply({ error: "MethodNotImplemented", message: "Method Not Implemented" }, 501);

    if (world.expireNextChatCall) {
      world.expireNextChatCall = false;
      return reply({ error: "ExpiredToken", message: "Token has expired" }, 400);
    }
    if (!world.dmScope) return reply({ error: "InvalidToken", message: "Bad token scope" }, 400);
    if (nsid === "chat.bsky.convo.listConvos") return reply({ convos: [] });
    if (nsid === "chat.bsky.convo.getLog") {
      const cursor = url.searchParams.get("cursor");
      const logs = world.logs.filter((log) => !cursor || log.rev > cursor);
      return reply({ cursor: logs.at(-1)?.rev ?? cursor ?? undefined, logs: logs.map((log) => log.entry) });
    }
    if (nsid === "chat.bsky.convo.acceptConvo") return reply({});
    if (nsid === "chat.bsky.convo.getConvoForMembers") return reply({ convo: { id: "convo-1" } });
    if (nsid === "chat.bsky.convo.sendMessage") return reply({ id: `sent-${calls.length}`, text: (body.message as { text: string }).text });
    return reply({ error: "MethodNotImplemented" }, 501);
  });
}

describe("Bluesky through the whole app", () => {
  let botId = "";

  const currentRow = async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(bots).where(eq(bots.id, botId));
    return row!;
  };

  beforeAll(async () => {
    // A throwaway database in a temp folder, so the real .data stays untouched.
    process.chdir(mkdtempSync(path.join(tmpdir(), "relay-bluesky-")));
    vi.stubGlobal("fetch", fakeBluesky());
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values({ id: "owner-1", email: "owner@example.test", name: "Owner", passwordHash: "x" });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a wrong password and an app password without direct message access", async () => {
    const { connectChannelAccount } = await import("@/lib/bots");
    await expect(connectChannelAccount({ channel: "bluesky", ownerId: "owner-1", token: "wrong", externalAccountId: "recatch.bsky.social" })).rejects.toThrow(/Invalid identifier/);

    world.dmScope = false;
    await expect(connectChannelAccount({ channel: "bluesky", ownerId: "owner-1", token: PASSWORD, externalAccountId: "recatch.bsky.social" })).rejects.toThrow(/Allow access to your direct messages/);
    world.dmScope = true;

    await expect(connectChannelAccount({ channel: "bluesky", ownerId: "owner-1", token: PASSWORD })).rejects.toThrow(/handle/);
  });

  it("connects with a handle and keeps the app password encrypted", async () => {
    const { connectChannelAccount } = await import("@/lib/bots");
    const bot = await connectChannelAccount({ channel: "bluesky", ownerId: "owner-1", token: PASSWORD, externalAccountId: "@recatch.bsky.social" });
    botId = bot.id;
    expect(bot).toMatchObject({ channel: "bluesky", name: "@recatch.bsky.social (Bluesky)", status: "connected", webhookUrl: null });

    const row = await currentRow();
    expect(row.externalAccountId).toBe(ME);
    expect(row.tokenEncrypted).not.toContain(PASSWORD);
  });

  it("asks the chat service for the log, and does not answer old conversations on the first look", async () => {
    const { pollBlueskyAccount } = await import("@/lib/channels/bluesky-manager");
    world.logs = [incoming("r1", "old-1", "an old message")];
    calls.length = 0;
    await pollBlueskyAccount(await currentRow());

    const log = calls.find((call) => call.nsid === "chat.bsky.convo.getLog")!;
    expect(log.proxy).toBe("did:web:api.bsky.chat#bsky_chat");
    expect(log.host).toBe("pds.example.test");
    expect(log.auth).toMatch(/^Bearer /);
    expect((await currentRow()).settings?.blueskyCursor).toBe("r1");

    const { getDb } = await import("@/lib/db");
    const { contacts } = await import("@/lib/db/schema");
    expect(await (await getDb()).select().from(contacts).where(eq(contacts.botId, botId))).toHaveLength(0);
    expect(calls.some((call) => call.nsid === "chat.bsky.convo.sendMessage")).toBe(false);
  });

  it("answers a new message with the welcome flow, sent back as a DM", async () => {
    const { pollBlueskyAccount } = await import("@/lib/channels/bluesky-manager");
    world.logs.push(incoming("r2", "m-2", "hello there"), incoming("r3", "m-3", "my own echo", ME));
    calls.length = 0;
    await pollBlueskyAccount(await currentRow());

    const { getDb } = await import("@/lib/db");
    const { contacts, messages } = await import("@/lib/db/schema");
    const db = await getDb();
    await vi.waitFor(async () => expect(await db.select().from(contacts).where(eq(contacts.botId, botId))).toHaveLength(1), { timeout: 5000 });
    const [contact] = await db.select().from(contacts).where(eq(contacts.botId, botId));
    expect(contact).toMatchObject({ telegramUserId: "did:plc:ada", username: "ada.bsky.social", firstName: "Ada" });

    await vi.waitFor(async () => {
      const log = await db.select().from(messages).where(eq(messages.contactId, contact.id));
      expect(log.some((message) => message.direction === "outbound")).toBe(true);
    }, { timeout: 5000 });
    const log = await db.select().from(messages).where(eq(messages.contactId, contact.id));
    expect(log.filter((message) => message.direction === "inbound").map((message) => message.body)).toEqual(["hello there"]);

    const sent = calls.filter((call) => call.nsid === "chat.bsky.convo.sendMessage");
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((call) => call.body.convoId === "convo-1" && typeof (call.body.message as { text: string }).text === "string")).toBe(true);
    expect(calls.some((call) => call.nsid === "chat.bsky.convo.acceptConvo")).toBe(true);
    expect((await currentRow()).settings?.blueskyCursor).toBe("r3");
  });

  it("does not queue the same message twice", async () => {
    const { pollBlueskyAccount } = await import("@/lib/channels/bluesky-manager");
    calls.length = 0;
    await pollBlueskyAccount(await currentRow());
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(calls.filter((call) => call.nsid === "chat.bsky.convo.sendMessage")).toHaveLength(0);
  });

  it("reuses its sign-in between polls and recovers when Bluesky says the token expired", async () => {
    const { pollBlueskyAccount } = await import("@/lib/channels/bluesky-manager");
    const before = world.sessions;
    await pollBlueskyAccount(await currentRow());
    await pollBlueskyAccount(await currentRow());
    expect(world.sessions).toBe(before);

    world.expireNextChatCall = true;
    await pollBlueskyAccount(await currentRow());
    expect(world.sessions).toBe(before + 1);
    expect((await currentRow()).status).toBe("connected");
  });

  it("shows the error on the account when polling fails, then clears it", async () => {
    const { pollBlueskyAccount } = await import("@/lib/channels/bluesky-manager");
    const { forgetBlueskySession } = await import("@/lib/channels/bluesky");
    world.dmScope = false;
    forgetBlueskySession(botId);
    await pollBlueskyAccount(await currentRow());
    expect(await currentRow()).toMatchObject({ status: "error" });
    expect((await currentRow()).lastHealthError).toMatch(/direct messages/);

    world.dmScope = true;
    await pollBlueskyAccount(await currentRow());
    expect(await currentRow()).toMatchObject({ status: "connected", lastHealthError: null });
  });

  it("health check signs in again and keeps the account connected", async () => {
    const { healthCheckBot } = await import("@/lib/bots");
    const result = await healthCheckBot(botId);
    expect(result.bot).toMatchObject({ status: "connected", name: "@recatch.bsky.social (Bluesky)" });
  });
});
