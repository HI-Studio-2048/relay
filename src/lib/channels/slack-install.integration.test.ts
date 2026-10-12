import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let signedIn = "owner-1";
vi.mock("@/lib/auth", () => ({ requireUserId: async () => signedIn }));

const SIGNING = "company-signing-secret";
const realFetch = globalThis.fetch;
const slackCalls: { method: string; auth: string | null; body: string }[] = [];

/** A stand-in for Slack: the OAuth exchange, revoke, user lookup and posting. */
function fakeSlack() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host !== "slack.com") return realFetch(input, init);
    const method = url.pathname.replace("/api/", "");
    const headers = new Headers(init?.headers);
    const body = init?.body ? String(init.body) : "";
    slackCalls.push({ method, auth: headers.get("authorization"), body });
    const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    if (method === "oauth.v2.access") {
      const params = new URLSearchParams(body);
      if (params.get("client_id") !== "cid" || params.get("client_secret") !== "csecret") return reply({ ok: false, error: "invalid_client_id" });
      if (params.get("code") === "bad-code") return reply({ ok: false, error: "invalid_code" });
      const team = params.get("code") === "code-b" ? { id: "T-B", name: "Beta Co" } : { id: "T-A", name: "Acme" };
      return reply({ ok: true, access_token: `xoxb-${team.id}`, bot_user_id: `UBOT-${team.id}`, app_id: "A1", team });
    }
    if (method === "auth.revoke") return reply({ ok: true, revoked: true });
    if (method === "users.info") return reply({ ok: true, user: { name: "ada", real_name: "Ada Lovelace" } });
    if (method === "chat.postMessage") return reply({ ok: true, ts: "1.1" });
    return reply({ ok: false, error: "unknown_method" });
  });
}

const signed = (body: string, contentType = "application/json", secret = SIGNING) => {
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
  return new Request("https://recatch.test/api/slack/events", {
    method: "POST",
    headers: { "content-type": contentType, "x-slack-request-timestamp": ts, "x-slack-signature": signature },
    body,
  });
};

describe("Add to Slack through the whole app", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-slack-install-")));
    vi.stubEnv("SLACK_CLIENT_ID", "cid");
    vi.stubEnv("SLACK_CLIENT_SECRET", "csecret");
    vi.stubEnv("SLACK_SIGNING_SECRET", SIGNING);
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubGlobal("fetch", fakeSlack());
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
    const { GET: start } = await import("@/app/api/slack/install/route");
    const { GET: callback } = await import("@/app/api/slack/oauth/callback/route");
    const began = await start(new Request("https://recatch.test/api/slack/install"));
    expect(began.status).toBe(303);
    const target = new URL(began.headers.get("location")!);
    const done = await callback(new Request(`https://recatch.test/api/slack/oauth/callback?code=${code}&state=${encodeURIComponent(target.searchParams.get("state")!)}`));
    return { target, done: new URL(done.headers.get("location")!) };
  };

  it("sends the person to Slack with the company app's id, the scopes and a signed state", async () => {
    const { target } = await install("code-a");
    expect(target.origin + target.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(target.searchParams.get("client_id")).toBe("cid");
    expect(target.searchParams.get("scope")).toBe("chat:write,im:history,im:read,im:write,users:read");
    expect(target.searchParams.get("redirect_uri")).toBe("https://recatch.test/api/slack/oauth/callback");
  });

  it("saves the workspace from the install, with the token encrypted and no webhook to paste", async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [row] = (await (await getDb()).select().from(bots)).filter((item) => item.channel === "slack");
    expect(row).toMatchObject({ ownerId: "owner-1", name: "Acme (Slack)", externalAccountId: "UBOT-T-A", status: "connected", webhookUrl: null, appSecretEncrypted: null });
    expect(row!.tokenEncrypted).not.toContain("xoxb-T-A");
    expect(row!.settings).toMatchObject({ slackTeamId: "T-A", slackInstalled: true });
  });

  it("installing again in the same workspace updates it instead of adding a second", async () => {
    await install("code-a");
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    expect((await (await getDb()).select().from(bots)).filter((item) => item.channel === "slack")).toHaveLength(1);
  });

  it("refuses a workspace another Recatch user already connected", async () => {
    signedIn = "owner-2";
    const { done } = await install("code-a");
    signedIn = "owner-1";
    expect(done.searchParams.get("error")).toMatch(/already connected/);
  });

  it("reports a failed exchange and a cancelled install without saving anything", async () => {
    const { done } = await install("bad-code");
    expect(done.searchParams.get("error")).toMatch(/invalid_code/);
    const { GET: callback } = await import("@/app/api/slack/oauth/callback/route");
    const cancelled = await callback(new Request("https://recatch.test/api/slack/oauth/callback?error=access_denied"));
    expect(new URL(cancelled.headers.get("location")!).searchParams.get("error")).toMatch(/cancelled/);
    const forged = await callback(new Request("https://recatch.test/api/slack/oauth/callback?code=x&state=nope"));
    expect(new URL(forged.headers.get("location")!).searchParams.get("error")).toMatch(/could not be verified/);
  });

  it("answers the URL check and rejects unsigned or wrongly signed deliveries on the shared URL", async () => {
    const { POST } = await import("@/app/api/slack/events/route");
    const check = JSON.stringify({ type: "url_verification", challenge: "abc" });
    const ok = await POST(signed(check));
    expect(await ok.text()).toBe("abc");
    expect((await POST(signed(check, "application/json", "someone-elses"))).status).toBe(401);
    expect((await POST(new Request("https://recatch.test/x", { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("routes a DM to the workspace that installed the app and answers through its own token", async () => {
    const { POST } = await import("@/app/api/slack/events/route");
    slackCalls.length = 0;
    const event = JSON.stringify({ type: "event_callback", team_id: "T-A", event_id: "Ev-A1", event: { type: "message", channel_type: "im", user: "U77", text: "hi there", ts: "9.9" } });
    expect((await POST(signed(event))).status).toBe(200);

    const { getDb } = await import("@/lib/db");
    const { bots, contacts } = await import("@/lib/db/schema");
    const db = await getDb();
    const [bot] = (await db.select().from(bots)).filter((item) => item.channel === "slack");
    await vi.waitFor(async () => expect(await db.select().from(contacts).where(eq(contacts.botId, bot!.id))).toHaveLength(1), { timeout: 5000 });
    const [contact] = await db.select().from(contacts).where(eq(contacts.botId, bot!.id));
    expect(contact).toMatchObject({ telegramUserId: "U77", firstName: "Ada" });
    await vi.waitFor(() => expect(slackCalls.some((call) => call.method === "chat.postMessage")).toBe(true), { timeout: 5000 });
    expect(slackCalls.filter((call) => call.method === "chat.postMessage").every((call) => call.auth === "Bearer xoxb-T-A")).toBe(true);
  });

  it("ignores a delivery for a workspace that never installed the app", async () => {
    const { POST } = await import("@/app/api/slack/events/route");
    const before = slackCalls.length;
    const event = JSON.stringify({ type: "event_callback", team_id: "T-UNKNOWN", event_id: "Ev-X", event: { type: "message", channel_type: "im", user: "U1", text: "hi", ts: "1.0" } });
    expect((await POST(signed(event))).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(slackCalls.length).toBe(before);
  });

  it("marks the account when Slack says the app was removed", async () => {
    const { POST } = await import("@/app/api/slack/events/route");
    const event = JSON.stringify({ type: "event_callback", team_id: "T-A", event_id: "Ev-A2", event: { type: "app_uninstalled" } });
    expect((await POST(signed(event))).status).toBe(200);
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [bot] = (await (await getDb()).select().from(bots)).filter((item) => item.channel === "slack");
    expect(bot).toMatchObject({ status: "error" });
    expect(bot!.lastHealthError).toMatch(/removed from this workspace/);
  });

  it("gives the app back to the workspace when the account is disconnected", async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const { revokeSlackToken } = await import("@/lib/channels/slack-install");
    slackCalls.length = 0;
    await revokeSlackToken("xoxb-T-A");
    expect(slackCalls[0]).toMatchObject({ method: "auth.revoke", auth: "Bearer xoxb-T-A" });
    expect((await (await getDb()).select().from(bots)).length).toBeGreaterThan(0);
  });
});

describe("shared URL before the signing secret exists", () => {
  it("still answers Slack's URL check, so the app can be created from the manifest, and nothing else", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", "");
    const { POST } = await import("@/app/api/slack/events/route");
    const unsigned = (body: unknown) => new Request("https://recatch.test/api/slack/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(await (await POST(unsigned({ type: "url_verification", challenge: "first" }))).text()).toBe("first");
    expect((await POST(unsigned({ type: "event_callback", team_id: "T-A", event: { type: "message", channel_type: "im", user: "U1", text: "x" } }))).status).toBe(401);
    vi.stubEnv("SLACK_SIGNING_SECRET", SIGNING);
  });
});
