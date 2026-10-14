import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The routes read the signed-in user from proxy.ts; stand in for it here.
let signedIn = "owner-1";
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), requireUserId: async () => signedIn }));

const queued: { botId: string; update: unknown }[] = [];
vi.mock("@/lib/queue", () => ({
  enqueueWebhook: async (job: { botId: string; update: unknown }) => void queued.push(job),
  shouldRunWorker: () => false,
}));
vi.mock("@/lib/worker", () => ({ drainJobs: async () => 0 }));

const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const realFetch = globalThis.fetch;

type Profile = { _id: string; name: string; externalId: string };
type Account = { _id: string; platform: string; username: string; profileId: string; isActive: boolean };
let profiles: Profile[] = [];
let accounts: Account[] = [];
const calls: string[] = [];

/** A stand-in for Zernio's API that keeps profiles and accounts, like the real one. */
function fakeZernio() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== "zernio.com") return realFetch(input, init);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}${url.search}`);
    if ((init?.headers as Record<string, string>)?.authorization !== "Bearer sk_company") return respond({ error: "bad key" }, 401);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname === "/api/v1/profiles" && method === "GET") {
      const wanted = url.searchParams.get("externalId");
      return respond({ profiles: profiles.filter((profile) => !wanted || profile.externalId === wanted) });
    }
    if (url.pathname === "/api/v1/profiles" && method === "POST") {
      const profile = { _id: `p-${profiles.length + 1}`, name: body.name, externalId: body.externalId };
      profiles.push(profile);
      return respond({ profile }, 201);
    }
    if (url.pathname === "/api/v1/accounts" && method === "GET") {
      const wanted = url.searchParams.get("profileId");
      return respond({ accounts: accounts.filter((account) => !wanted || account.profileId === wanted) });
    }
    if (url.pathname.startsWith("/api/v1/accounts/") && method === "DELETE") {
      const id = url.pathname.split("/").pop();
      accounts = accounts.filter((account) => account._id !== id);
      return respond({ ok: true });
    }
    if (url.pathname.startsWith("/api/v1/connect/") && method === "GET") {
      return respond({ authUrl: `https://www.instagram.com/oauth/authorize?profile=${url.searchParams.get("profileId")}` });
    }
    return respond({ error: "unexpected" }, 404);
  });
}

const sign = (raw: string, secret = "whsec") => createHmac("sha256", secret).update(raw, "utf8").digest("hex");
const post = (handler: (request: Request) => Promise<Response>, url: string, body: unknown) =>
  handler(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("Meta accounts through the company Zernio key", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-zernio-")));
    vi.stubEnv("ZERNIO_API_KEY", "sk_company");
    vi.stubEnv("ZERNIO_WEBHOOK_SECRET", "whsec");
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubGlobal("fetch", fakeZernio());
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values([
      { id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" },
      { id: "owner-2", email: "two@example.test", name: "Two", passwordHash: "x" },
    ]);
  });

  afterAll(() => vi.unstubAllGlobals());

  beforeEach(() => {
    signedIn = "owner-1";
    queued.length = 0;
    calls.length = 0;
  });

  it("starts the connect in the signed-in user's own profile, made once", async () => {
    const { POST } = await import("@/app/api/zernio/connect/route");
    const first = await post(POST, "https://recatch.test/api/zernio/connect", { platform: "instagram" });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { authUrl: string }).authUrl).toContain("profile=p-1");
    await post(POST, "https://recatch.test/api/zernio/connect", { platform: "facebook" });
    expect(profiles).toEqual([{ _id: "p-1", name: expect.any(String), externalId: "owner-1" }]);
    signedIn = "owner-2";
    const other = await post(POST, "https://recatch.test/api/zernio/connect", { platform: "instagram" });
    expect(((await other.json()) as { authUrl: string }).authUrl).toContain("profile=p-2");
    expect(calls.some((call) => call.includes("/connect/instagram?") && call.includes("redirect_url=https%3A%2F%2Frecatch.test%2Fapi%2Fzernio%2Fcallback"))).toBe(true);
  });

  it("only offers Meta networks", async () => {
    const { POST } = await import("@/app/api/zernio/connect/route");
    expect((await post(POST, "https://recatch.test/api/zernio/connect", { platform: "tiktok" })).status).toBe(400);
  });

  it("makes the Meta account on the callback and shows only that user's accounts", async () => {
    accounts = [
      { _id: "a-1", platform: "instagram", username: "mine", profileId: "p-1", isActive: true },
      { _id: "a-2", platform: "instagram", username: "someone_else", profileId: "p-2", isActive: true },
    ];
    const { GET } = await import("@/app/api/zernio/callback/route");
    const response = await GET(new Request("https://recatch.test/api/zernio/callback?connected=instagram&accountId=a-1&username=mine"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const db = await getDb();
    const [row] = await db.select().from(bots).where(and(eq(bots.ownerId, "owner-1"), eq(bots.channel, "zernio")));
    expect(row?.status).toBe("connected");
    expect((row?.settings?.zernioAccounts as { id: string }[]).map((account) => account.id)).toEqual(["a-1"]);
    expect(row?.webhookUrl).toBe("https://recatch.test/api/zernio/webhook");
    const { accountFromRow } = await import("@/lib/channels");
    expect(accountFromRow(row!).token).toBe("sk_company");
  });

  it("refuses to disconnect or reconnect an account in another user's profile", async () => {
    const { DELETE } = await import("@/app/api/zernio/accounts/[accountId]/route");
    const refused = await DELETE(
      new Request("https://recatch.test/api/zernio/accounts/a-2", { method: "DELETE", body: JSON.stringify({ confirm: true }) }),
      { params: Promise.resolve({ accountId: "a-2" }) },
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(accounts.some((account) => account._id === "a-2")).toBe(true);
    const { POST } = await import("@/app/api/zernio/connect/route");
    const reconnect = await post(POST, "https://recatch.test/api/zernio/connect", { platform: "instagram", reconnectAccountId: "a-2" });
    expect(reconnect.status).toBe(400);
  });

  it("disconnects the user's own account", async () => {
    const { DELETE } = await import("@/app/api/zernio/accounts/[accountId]/route");
    const done = await DELETE(
      new Request("https://recatch.test/api/zernio/accounts/a-1", { method: "DELETE", body: JSON.stringify({ confirm: true }) }),
      { params: Promise.resolve({ accountId: "a-1" }) },
    );
    expect(done.status).toBe(200);
    expect(accounts.map((account) => account._id)).toEqual(["a-2"]);
  });

  it("routes webhook events to the profile's owner and drops everything unsigned", async () => {
    accounts.push({ _id: "a-3", platform: "instagram", username: "mine", profileId: "p-1", isActive: true });
    const { syncZernioBot } = await import("@/lib/bots");
    await syncZernioBot("owner-1");
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(bots).where(and(eq(bots.ownerId, "owner-1"), eq(bots.channel, "zernio")));
    const { POST } = await import("@/app/api/zernio/webhook/route");

    const event = { event: "message.received", profiles: [{ id: "p-1", externalId: "owner-1" }], account: { accountId: "a-3", platform: "instagram" }, message: { id: "m1", text: "hi", sender: { id: "u1" } } };
    const raw = JSON.stringify(event);
    const send = (body: string, signature: string | null) =>
      POST(new Request("https://recatch.test/api/zernio/webhook", { method: "POST", headers: signature ? { "x-zernio-signature": signature } : {}, body }));

    expect((await send(raw, null)).status).toBe(401);
    expect((await send(raw, sign(raw, "wrong"))).status).toBe(401);
    expect(queued).toHaveLength(0);

    expect((await send(raw, sign(raw))).status).toBe(200);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.botId).toBe(row!.id);

    const stray = JSON.stringify({ event: "message.received", account: { accountId: "a-9" }, message: { sender: { id: "u2" } } });
    expect((await send(stray, sign(stray))).status).toBe(200);
    const unknown = JSON.stringify({ ...event, profiles: [{ id: "p-9", externalId: "nobody" }] });
    expect((await send(unknown, sign(unknown))).status).toBe(200);
    expect(queued).toHaveLength(1);
  });

  it("saves an account Zernio connected even when the callback carries none of the expected parameters", async () => {
    // What happened live: Zernio linked an Instagram account but the callback lacked connected/accountId.
    signedIn = "owner-2";
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const db = await getDb();
    const owner2 = () => db.select().from(bots).where(and(eq(bots.ownerId, "owner-2"), eq(bots.channel, "zernio")));
    expect(await owner2()).toHaveLength(0);

    const { GET } = await import("@/app/api/zernio/callback/route");
    const response = await GET(new Request("https://recatch.test/api/zernio/callback?status=success"));
    expect(response.headers.get("location")).toContain("connected=");
    const [row] = await owner2();
    expect((row?.settings?.zernioAccounts as { id: string }[]).map((account) => account.id)).toEqual(["a-2"]);
  });

  it("finds the owner of an account event from the account's profile when the event has no profiles list", async () => {
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.delete(bots).where(eq(bots.ownerId, "owner-2"));
    const { POST } = await import("@/app/api/zernio/webhook/route");
    const send = (body: unknown) => {
      const raw = JSON.stringify(body);
      return POST(new Request("https://recatch.test/api/zernio/webhook", { method: "POST", headers: { "x-zernio-signature": sign(raw) }, body: raw }));
    };

    expect((await send({ event: "account.connected", account: { _id: "a-2", platform: "instagram", profileId: "p-2" } })).status).toBe(200);
    expect(await db.select().from(bots).where(eq(bots.ownerId, "owner-2"))).toHaveLength(1);

    await db.delete(bots).where(eq(bots.ownerId, "owner-2"));
    expect((await send({ event: "account.connected", account: { _id: "a-2", profileId: { _id: "p-2", externalId: "owner-2" } } })).status).toBe(200);
    expect(await db.select().from(bots).where(eq(bots.ownerId, "owner-2"))).toHaveLength(1);
  });

  it("answers 503 when the webhook secret is not set", async () => {
    vi.stubEnv("ZERNIO_WEBHOOK_SECRET", "");
    const { POST } = await import("@/app/api/zernio/webhook/route");
    const response = await POST(new Request("https://recatch.test/api/zernio/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    vi.stubEnv("ZERNIO_WEBHOOK_SECRET", "whsec");
  });
});
