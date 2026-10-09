import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Starting a real Gateway would dial discord.com, so connecting a bot must not open one here.
vi.mock("@/lib/channels/discord-manager", () => ({ syncDiscordGateways: vi.fn(async () => undefined), discordGatewayState: () => "stopped" }));

type Call = { method: string; path: string; body: unknown; auth: string | null };
const calls: Call[] = [];
const realFetch = globalThis.fetch;

/** A stand-in for Discord's REST API: just enough to connect a bot and send a DM. */
function fakeDiscord(token: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host !== "discord.com") return realFetch(input, init);
    const route = url.pathname.replace("/api/v10", "");
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? "GET", path: route, body, auth: headers.get("authorization") });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (headers.get("authorization") !== `Bot ${token}`) return reply({ message: "401: Unauthorized" }, 401);
    if (route === "/users/@me") return reply({ id: "900", username: "relaybot", global_name: "Recatch Bot" });
    if (route === "/users/@me/channels") return reply({ id: "dm-42" });
    if (route === "/channels/dm-42/messages") return reply({ id: `sent-${calls.length}` });
    if (route === "/channels/dm-42/typing") return new Response(null, { status: 204 });
    return reply({ message: `Unexpected ${route}` }, 404);
  });
}

describe("Discord through the whole app", () => {
  let botId = "";
  const TOKEN = "test-token-not-real";

  beforeAll(async () => {
    // A throwaway database in a temp folder, so the real .data stays untouched.
    process.chdir(mkdtempSync(path.join(tmpdir(), "relay-discord-")));
    vi.stubGlobal("fetch", fakeDiscord(TOKEN));
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values({ id: "owner-1", email: "owner@example.test", name: "Owner", passwordHash: "x" });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("connects a bot with its token and keeps the token encrypted", async () => {
    const { connectChannelAccount } = await import("@/lib/bots");
    const bot = await connectChannelAccount({ channel: "discord", ownerId: "owner-1", token: TOKEN });
    botId = bot.id;
    expect(bot.channel).toBe("discord");
    expect(bot.name).toBe("Recatch Bot (Discord)");

    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(bots).where(eq(bots.id, botId));
    expect(row.externalAccountId).toBe("900");
    expect(row.tokenEncrypted).not.toContain(TOKEN);
  });

  it("rejects a wrong token without saving anything", async () => {
    const { connectChannelAccount } = await import("@/lib/bots");
    await expect(connectChannelAccount({ channel: "discord", ownerId: "owner-1", token: "wrong" })).rejects.toThrow(/Discord/);
  });

  it("answers a first direct message with the welcome flow, sent back through Discord", async () => {
    const { processChannelUpdate } = await import("@/lib/webhook");
    calls.length = 0;
    await processChannelUpdate(botId, {
      t: "MESSAGE_CREATE",
      d: { id: "msg-1", content: "hello there", author: { id: "42", username: "ada", global_name: "Ada Lovelace" } },
    });

    const { getDb } = await import("@/lib/db");
    const { contacts, messages } = await import("@/lib/db/schema");
    const db = await getDb();
    const [contact] = await db.select().from(contacts).where(eq(contacts.botId, botId));
    expect(contact).toMatchObject({ telegramUserId: "42", username: "ada", firstName: "Ada" });

    const log = await db.select().from(messages).where(eq(messages.contactId, contact.id));
    expect(log.filter((message) => message.direction === "inbound").map((message) => message.body)).toContain("hello there");
    expect(log.some((message) => message.direction === "outbound")).toBe(true);

    // The reply went out through Discord: open the DM, then post into it as the bot.
    const sent = calls.filter((call) => call.method === "POST" && call.path === "/channels/dm-42/messages");
    expect(calls.some((call) => call.path === "/users/@me/channels" && (call.body as { recipient_id: string }).recipient_id === "42")).toBe(true);
    expect(sent.length).toBeGreaterThan(0);
    expect((sent[0].body as { content: string }).content.length).toBeGreaterThan(0);
    expect(sent.every((call) => call.auth === `Bot ${TOKEN}`)).toBe(true);
  });

  it("ignores a message from another bot", async () => {
    const { processChannelUpdate } = await import("@/lib/webhook");
    calls.length = 0;
    await processChannelUpdate(botId, { t: "MESSAGE_CREATE", d: { id: "msg-2", content: "beep", author: { id: "7", username: "otherbot", bot: true } } });
    expect(calls).toHaveLength(0);
  });
});
