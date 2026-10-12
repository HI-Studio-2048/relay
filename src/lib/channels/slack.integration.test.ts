import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Call = { method: string; body: Record<string, unknown>; auth: string | null };
const calls: Call[] = [];
const realFetch = globalThis.fetch;

/** A stand-in for Slack's Web API: enough to connect an app, look a person up and post a DM. */
function fakeSlack(token: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host !== "slack.com") return realFetch(input, init);
    const method = url.pathname.replace("/api/", "");
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ method, body, auth: headers.get("authorization") });
    const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    if (headers.get("authorization") !== `Bearer ${token}`) return reply({ ok: false, error: "invalid_auth" });
    if (method === "auth.test") return reply({ ok: true, team: "Acme", team_id: "T1", user: "recatch", user_id: "UBOT" });
    if (method === "users.info") return reply({ ok: true, user: { name: "ada", real_name: "Ada Lovelace" } });
    if (method === "chat.postMessage") return reply({ ok: true, ts: `1700.${calls.length}` });
    return reply({ ok: false, error: "unknown_method" });
  });
}

describe("Slack through the whole app", () => {
  let botId = "";
  const TOKEN = "xoxb-test-not-real";
  const SECRET = "signing-secret-not-real";

  const signed = (body: string, headers: Record<string, string> = { "content-type": "application/json" }, secret = SECRET) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
    return new Request("https://recatch.test/api/slack/webhook/x", {
      method: "POST",
      headers: { ...headers, "x-slack-request-timestamp": ts, "x-slack-signature": signature },
      body,
    });
  };
  const params = () => ({ params: Promise.resolve({ botId }) });

  beforeAll(async () => {
    // A throwaway database in a temp folder, so the real .data stays untouched.
    process.chdir(mkdtempSync(path.join(tmpdir(), "relay-slack-")));
    vi.stubGlobal("fetch", fakeSlack(TOKEN));
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values({ id: "owner-1", email: "owner@example.test", name: "Owner", passwordHash: "x" });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("connects an app, keeps both secrets encrypted and hands back a webhook URL", async () => {
    const { connectChannelAccount } = await import("@/lib/bots");
    const bot = await connectChannelAccount({
      channel: "slack",
      ownerId: "owner-1",
      token: TOKEN,
      appSecret: SECRET,
      origin: "https://recatch.test/api/bots",
    });
    botId = bot.id;
    expect(bot).toMatchObject({ channel: "slack", name: "recatch in Acme (Slack)", status: "connected" });
    expect(bot.webhookUrl).toBe(`https://recatch.test/api/slack/webhook/${botId}`);

    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(bots).where(eq(bots.id, botId));
    expect(row.externalAccountId).toBe("UBOT");
    expect(row.tokenEncrypted).not.toContain(TOKEN);
    expect(row.appSecretEncrypted).not.toContain(SECRET);
  });

  it("needs the signing secret, and rejects a token Slack does not accept", async () => {
    const { connectChannelAccount } = await import("@/lib/bots");
    await expect(connectChannelAccount({ channel: "slack", ownerId: "owner-1", token: TOKEN })).rejects.toThrow(/Signing Secret/);
    await expect(connectChannelAccount({ channel: "slack", ownerId: "owner-1", token: "xoxb-wrong", appSecret: SECRET })).rejects.toThrow(/invalid_auth/);
  });

  it("answers Slack's URL check, but only when the request is signed", async () => {
    const { POST } = await import("@/app/api/slack/webhook/[botId]/route");
    const body = JSON.stringify({ type: "url_verification", challenge: "abc123" });

    const ok = await POST(signed(body), params());
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("abc123");

    const forged = await POST(signed(body, { "content-type": "application/json" }, "someone-elses-secret"), params());
    expect(forged.status).toBe(401);
  });

  it("refuses an unsigned request and an unknown account", async () => {
    const { POST } = await import("@/app/api/slack/webhook/[botId]/route");
    const unsigned = new Request("https://recatch.test/x", { method: "POST", body: "{}" });
    expect((await POST(unsigned, params())).status).toBe(401);
    expect((await POST(unsigned, { params: Promise.resolve({ botId: "nope" }) })).status).toBe(404);
  });

  it("accepts a signed event and a form-encoded button tap", async () => {
    const { POST } = await import("@/app/api/slack/webhook/[botId]/route");
    const event = JSON.stringify({ type: "event_callback", event_id: "Ev-int-1", event: { type: "message", channel_type: "im", user: "U42", text: "hi", ts: "1.1" } });
    expect((await POST(signed(event), params())).status).toBe(200);

    const tap = new URLSearchParams({
      payload: JSON.stringify({ type: "block_actions", trigger_id: "tr-int-1", user: { id: "U43" }, actions: [{ action_id: "b0", value: "n:x" }] }),
    }).toString();
    expect((await POST(signed(tap, { "content-type": "application/x-www-form-urlencoded" }), params())).status).toBe(200);
  });

  it("answers a first direct message with the welcome flow, sent back through Slack", async () => {
    const { processChannelUpdate } = await import("@/lib/webhook");
    calls.length = 0;
    await processChannelUpdate(botId, {
      type: "event_callback",
      event_id: "Ev-int-2",
      event: { type: "message", channel_type: "im", user: "U99", text: "hello there", ts: "5.5" },
    });

    const { getDb } = await import("@/lib/db");
    const { contacts, messages } = await import("@/lib/db/schema");
    const db = await getDb();
    const [contact] = await db.select().from(contacts).where(eq(contacts.telegramUserId, "U99"));
    expect(contact).toMatchObject({ username: "ada", firstName: "Ada" });

    const log = await db.select().from(messages).where(eq(messages.contactId, contact.id));
    expect(log.filter((message) => message.direction === "inbound").map((message) => message.body)).toContain("hello there");
    expect(log.some((message) => message.direction === "outbound")).toBe(true);

    const sent = calls.filter((call) => call.method === "chat.postMessage" && call.body.channel === "U99");
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((call) => call.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("ignores the app's own messages", async () => {
    const { processChannelUpdate } = await import("@/lib/webhook");
    calls.length = 0;
    await processChannelUpdate(botId, {
      type: "event_callback",
      event: { type: "message", channel_type: "im", user: "UBOT", bot_id: "B1", text: "echo", ts: "6.6" },
    });
    expect(calls).toHaveLength(0);
  });
});
