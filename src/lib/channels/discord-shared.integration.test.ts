import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let signedIn = "owner-1";
vi.mock("@/lib/auth", () => ({ requireUserId: async () => signedIn }));
// The shared Gateway would dial discord.com; these tests feed it events directly instead.
vi.mock("@/lib/channels/discord-manager", () => ({ syncDiscordGateways: vi.fn(async () => undefined), discordGatewayState: () => "stopped" }));

const TOKEN = "SHARED-BOT-TOKEN";
type Call = { method: string; path: string; body: Record<string, unknown>; auth: string | null };
const calls: Call[] = [];
const realFetch = globalThis.fetch;
const goneGuilds = new Set<string>();

/** A stand-in for Discord: the install exchange, the command reply, DMs, guild lookups and leaving. */
function fakeDiscord() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host !== "discord.com") return realFetch(input, init);
    const route = url.pathname.replace("/api/v10", "");
    const headers = new Headers(init?.headers);
    const type = headers.get("content-type") ?? "";
    const text = init?.body ? String(init.body) : "";
    const body = (type.includes("json") ? (text ? JSON.parse(text) : {}) : Object.fromEntries(new URLSearchParams(text))) as Record<string, unknown>;
    calls.push({ method: init?.method ?? "GET", path: route, body, auth: headers.get("authorization") });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

    if (route === "/oauth2/token") {
      if (body.client_id !== "app-1" || body.client_secret !== "app-secret") return reply({ error: "invalid_client" }, 401);
      if (body.code === "bad") return reply({ error: "invalid_grant", error_description: "Invalid code" }, 400);
      const guild = body.code === "code-2" ? { id: "G2", name: "Beta Club" } : { id: "G1", name: "Acme Community" };
      return reply({ access_token: "user-token", guild });
    }
    if (route.startsWith("/interactions/")) return new Response(null, { status: 204 });
    if (headers.get("authorization") !== `Bot ${TOKEN}`) return reply({ message: "401: Unauthorized" }, 401);
    if (route === "/users/@me/channels") return reply({ id: `dm-${body.recipient_id}` });
    if (/^\/channels\/dm-[^/]+\/messages$/.test(route)) return reply({ id: `sent-${calls.length}` });
    if (route.startsWith("/guilds/")) return goneGuilds.has(route.split("/")[2]!) ? reply({ message: "Unknown Guild", code: 10004 }, 404) : reply({ id: route.split("/")[2] });
    if (route.startsWith("/users/@me/guilds/")) return new Response(null, { status: 204 });
    if (route.startsWith("/applications/")) return reply([]);
    return reply({ message: `Unexpected ${route}` }, 404);
  });
}

const command = (guildId: string, userId: string, id = `int-${Math.random()}`, options: { name: string; value: unknown }[] = []) => ({
  t: "INTERACTION_CREATE" as const,
  d: { id, token: `tok-${id}`, type: 2, guild_id: guildId, member: { user: { id: userId, username: `u${userId}`, global_name: `User ${userId}` } }, data: { name: "chat", options } },
});
const dm = (userId: string, content: string, id = `msg-${Math.random()}`) => ({ t: "MESSAGE_CREATE" as const, d: { id, content, author: { id: userId, username: `u${userId}`, global_name: `User ${userId}` } } });
const dmsTo = (userId: string) => calls.filter((call) => call.method === "POST" && call.path === `/channels/dm-${userId}/messages`);

describe("Add to Discord and the shared bot, through the whole app", () => {
  const botIds: Record<string, string> = {};

  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-discord-shared-")));
    vi.stubEnv("DISCORD_CLIENT_ID", "app-1");
    vi.stubEnv("DISCORD_CLIENT_SECRET", "app-secret");
    vi.stubEnv("DISCORD_BOT_TOKEN", TOKEN);
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubGlobal("fetch", fakeDiscord());
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    await (await getDb()).insert(users).values([
      { id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" },
      { id: "owner-2", email: "two@example.test", name: "Two", passwordHash: "x" },
    ]);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const install = async (code: string) => {
    const { GET: start } = await import("@/app/api/discord/install/route");
    const { GET: callback } = await import("@/app/api/discord/oauth/callback/route");
    const began = await start(new Request("https://recatch.test/api/discord/install"));
    expect(began.status).toBe(303);
    const target = new URL(began.headers.get("location")!);
    const done = await callback(new Request(`https://recatch.test/api/discord/oauth/callback?code=${code}&guild_id=FORGED&state=${encodeURIComponent(target.searchParams.get("state")!)}`));
    return { target, done: new URL(done.headers.get("location")!) };
  };

  const botFor = async (guildId: string) => {
    const { botForGuild } = await import("@/lib/channels/discord-shared");
    return (await botForGuild(guildId))!;
  };

  it("sends the person to Discord with the company app, the bot and command scopes and a signed state", async () => {
    const { target } = await install("code-1");
    expect(target.origin + target.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(target.searchParams.get("client_id")).toBe("app-1");
    expect(target.searchParams.get("scope")).toBe("bot applications.commands");
    expect(target.searchParams.get("redirect_uri")).toBe("https://recatch.test/api/discord/oauth/callback");
  });

  it("saves the server Discord reports, not the one named in the address, with no token of its own", async () => {
    const bot = await botFor("G1");
    botIds.G1 = bot.id;
    expect(bot).toMatchObject({ ownerId: "owner-1", name: "Acme Community (Discord)", externalAccountId: "guild:G1", status: "connected", webhookUrl: null });
    expect(bot.settings).toMatchObject({ discordShared: true, discordGuildId: "G1" });
    expect(bot.tokenEncrypted).not.toContain(TOKEN);
    const { botForGuild } = await import("@/lib/channels/discord-shared");
    expect(await botForGuild("FORGED")).toBeNull();
  });

  it("uses the shared bot's token when sending for that account", async () => {
    const { accountFromRow } = await import("@/lib/channels");
    expect(accountFromRow(await botFor("G1")).token).toBe(TOKEN);
  });

  it("refuses a server another Recatch user already connected, and reports a failed exchange", async () => {
    signedIn = "owner-2";
    const taken = await install("code-1");
    signedIn = "owner-1";
    expect(taken.done.searchParams.get("error")).toMatch(/already connected/);
    const bad = await install("bad");
    expect(bad.done.searchParams.get("error")).toMatch(/Invalid code/);
  });

  it("connects a second server for a second owner", async () => {
    signedIn = "owner-2";
    const { done } = await install("code-2");
    signedIn = "owner-1";
    expect(done.searchParams.get("connected")).toMatch(/Beta Club/);
    botIds.G2 = (await botFor("G2")).id;
  });

  it("answers /chat in a connected server privately, records the route and starts the flow in a DM", async () => {
    const { handleSharedEvent, discordRouteOf } = await import("@/lib/channels/discord-shared");
    calls.length = 0;
    await handleSharedEvent(command("G1", "U1", "int-a"));

    const ack = calls.find((call) => call.path === "/interactions/int-a/tok-int-a/callback")!;
    expect(ack.body).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(await discordRouteOf("U1")).toBe(botIds.G1);

    const { getDb } = await import("@/lib/db");
    const { contacts } = await import("@/lib/db/schema");
    const db = await getDb();
    await vi.waitFor(async () => expect(await db.select().from(contacts).where(eq(contacts.botId, botIds.G1!))).toHaveLength(1), { timeout: 5000 });
    expect((await db.select().from(contacts).where(eq(contacts.botId, botIds.G1!)))[0]).toMatchObject({ telegramUserId: "U1", firstName: "User" });
    await vi.waitFor(() => expect(dmsTo("U1").length).toBeGreaterThan(0), { timeout: 5000 });
    expect(dmsTo("U1").every((call) => call.auth === `Bot ${TOKEN}`)).toBe(true);
  });

  it("delivers a later DM from that person to the same customer's account", async () => {
    const { handleSharedEvent } = await import("@/lib/channels/discord-shared");
    await handleSharedEvent(dm("U1", "tell me more"));
    const { getDb } = await import("@/lib/db");
    const { contacts, messages } = await import("@/lib/db/schema");
    const db = await getDb();
    await vi.waitFor(async () => expect((await db.select().from(messages)).some((message) => message.body === "tell me more")).toBe(true), { timeout: 4000 });
    const saved = (await db.select().from(messages)).find((message) => message.body === "tell me more")!;
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, saved.contactId));
    expect(contact).toMatchObject({ botId: botIds.G1, telegramUserId: "U1" });
  });

  it("tells /chat in a server that has not connected Recatch, and records nothing", async () => {
    const { handleSharedEvent, discordRouteOf } = await import("@/lib/channels/discord-shared");
    calls.length = 0;
    await handleSharedEvent(command("G-NONE", "U5", "int-none"));
    const ack = calls.find((call) => call.path === "/interactions/int-none/tok-int-none/callback")!;
    expect(ack.body).toMatchObject({ type: 4, data: { flags: 64, content: expect.stringMatching(/hasn't connected Recatch/) } });
    expect(await discordRouteOf("U5")).toBeNull();
  });

  it("points a stranger who DMs the bot without a server to /chat, once an hour", async () => {
    const { handleSharedEvent } = await import("@/lib/channels/discord-shared");
    calls.length = 0;
    await handleSharedEvent(dm("U9", "hello?"));
    await handleSharedEvent(dm("U9", "anyone there?"));
    const hints = dmsTo("U9");
    expect(hints).toHaveLength(1);
    expect(String(hints[0]!.body.content)).toMatch(/\/chat/);
  });

  it("moves a person to the other customer when they run /chat from another server", async () => {
    const { handleSharedEvent, discordRouteOf } = await import("@/lib/channels/discord-shared");
    await handleSharedEvent(command("G2", "U1", "int-b"));
    expect(await discordRouteOf("U1")).toBe(botIds.G2);
    const { getDb } = await import("@/lib/db");
    const { contacts } = await import("@/lib/db/schema");
    const db = await getDb();
    await vi.waitFor(async () => expect(await db.select().from(contacts).where(eq(contacts.botId, botIds.G2!))).toHaveLength(1), { timeout: 5000 });
    // Their conversation with the first customer is still there, untouched.
    expect(await db.select().from(contacts).where(eq(contacts.botId, botIds.G1!))).toHaveLength(1);
  });

  it("starts a topic's growth link from the command option", async () => {
    const { parseDiscordEvent } = await import("@/lib/channels/discord");
    expect(parseDiscordEvent(command("G1", "U3", "i", [{ name: "topic", value: "promo" }]))[0]).toMatchObject({ externalUserId: "U3", text: "/start promo" });
    expect(parseDiscordEvent(command("G1", "U3", "i"))[0]?.text).toBe("/start");
  });

  it("ignores another bot's command and messages from other bots", async () => {
    const { parseDiscordEvent } = await import("@/lib/channels/discord");
    const robot = command("G1", "UB");
    (robot.d.member.user as { bot?: boolean }).bot = true;
    expect(parseDiscordEvent(robot)).toEqual([]);
  });

  it("health check says so when the bot was removed from the server", async () => {
    const { healthCheckBot } = await import("@/lib/bots");
    goneGuilds.add("G2");
    const result = await healthCheckBot(botIds.G2!);
    expect(result.bot.status).toBe("error");
    expect(result.bot.lastHealthError).toMatch(/no longer in this server/);
  });

  it("makes the bot leave the server when the account is disconnected", async () => {
    const { leaveDiscordGuild } = await import("@/lib/channels/discord-install");
    calls.length = 0;
    await leaveDiscordGuild("G1");
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/users/@me/guilds/G1", auth: `Bot ${TOKEN}` });
  });
});

describe("Add to Discord settings", () => {
  it("is off until all three secrets are set", async () => {
    const { discordInstallConfigured } = await import("@/lib/channels/discord-install");
    vi.stubEnv("DISCORD_CLIENT_ID", "app-1");
    vi.stubEnv("DISCORD_CLIENT_SECRET", "app-secret");
    vi.stubEnv("DISCORD_BOT_TOKEN", TOKEN);
    expect(discordInstallConfigured()).toBe(true);
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    expect(discordInstallConfigured()).toBe(false);
    vi.stubEnv("DISCORD_BOT_TOKEN", TOKEN);
  });
});
