import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The routes read the signed-in user from a request header that proxy.ts sets; stand in for it here.
let signedIn = "owner-1";
vi.mock("@/lib/auth", () => ({ requireUserId: async () => signedIn }));

const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

type Hit = { url: string; method: string; body: string };
const hits: Hit[] = [];
let refreshShouldFail = false;
const realFetch = globalThis.fetch;

/** Stand-ins for Google's and TikTok's servers. */
function fakeProviders() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!/google|tiktok/.test(url)) return realFetch(input, init);
    const body = init?.body ? String(init.body) : "";
    hits.push({ url, method: init?.method ?? "GET", body });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const params = new URLSearchParams(body);
      if (params.get("grant_type") === "refresh_token") {
        return refreshShouldFail ? respond({ error: "invalid_grant", error_description: "Token has been revoked" }, 400) : respond({ access_token: "G-AT-2", expires_in: 3600 });
      }
      return respond({ access_token: "G-AT-1", refresh_token: "G-RT", expires_in: 3600, scope: "https://www.googleapis.com/auth/youtube.readonly" });
    }
    if (url.includes("youtube/v3/channels")) return respond({ items: [{ id: "UC-studio", snippet: { title: "Studio Channel", thumbnails: { default: { url: "https://img/t.png" } } } }] });
    if (url.startsWith("https://open.tiktokapis.com/v2/oauth/token")) {
      return respond({ access_token: "T-AT", refresh_token: "T-RT", expires_in: 86400, refresh_expires_in: 31536000, open_id: "OPEN-1", scope: "user.info.basic" });
    }
    if (url.includes("v2/user/info")) return respond({ data: { user: { open_id: "OPEN-1", display_name: "Ada", avatar_url: "https://img/a.png" } }, error: { code: "ok" } });
    return respond({ error: "unexpected" }, 404);
  });
}

describe("OAuth connections through the whole app", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-oauth-")));
    vi.stubEnv("GOOGLE_CLIENT_ID", "g-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "g-secret");
    vi.stubEnv("TIKTOK_CLIENT_KEY", "t-key");
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "t-secret");
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubGlobal("fetch", fakeProviders());
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const db = await getDb();
    await db.insert(users).values([
      { id: "owner-1", email: "one@example.test", name: "One", passwordHash: "x" },
      { id: "owner-2", email: "two@example.test", name: "Two", passwordHash: "x" },
    ]);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function startAndCallback(provider: "google" | "tiktok") {
    const { GET: start } = await import("@/app/api/connections/[provider]/start/route");
    const { GET: callback } = await import("@/app/api/connections/[provider]/callback/route");
    const ctx = { params: Promise.resolve({ provider }) };
    const began = await start(new Request(`https://recatch.test/api/connections/${provider}/start`), ctx);
    expect(began.status).toBe(303);
    const target = new URL(began.headers.get("location")!);
    const state = target.searchParams.get("state")!;
    const cookie = (began.headers.get("set-cookie") ?? "").split(";")[0];
    const returned = await callback(
      new Request(`https://recatch.test/api/connections/${provider}/callback?code=THE-CODE&state=${encodeURIComponent(state)}`, { headers: { cookie } }),
      ctx,
    );
    return { began, target, returned };
  }

  it("signs in with Google: PKCE cookie out, tokens in, account saved and encrypted", async () => {
    const { began, returned } = await startAndCallback("google");
    expect(began.headers.get("set-cookie")).toMatch(/rc_oauth_verifier=.+HttpOnly.+SameSite=Lax/);
    expect(returned.status).toBe(303);
    const back = new URL(returned.headers.get("location")!);
    expect(back.pathname).toBe("/channels");
    expect(back.searchParams.get("connected")).toBe("YouTube connected: Studio Channel");

    // The verifier from the start cookie went to Google with the code.
    const exchange = hits.find((hit) => hit.url.startsWith("https://oauth2.googleapis.com/token") && hit.body.includes("authorization_code"))!;
    expect(new URLSearchParams(exchange.body).get("code_verifier")).toBeTruthy();
    expect(new URLSearchParams(exchange.body).get("redirect_uri")).toBe("https://recatch.test/api/connections/google/callback");

    const { getDb } = await import("@/lib/db");
    const { oauthConnections } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(oauthConnections).where(eq(oauthConnections.provider, "google"));
    expect(row).toMatchObject({ ownerId: "owner-1", externalAccountId: "UC-studio", displayName: "Studio Channel", status: "connected" });
    expect(row.accessTokenEncrypted).not.toContain("G-AT-1");
    expect(row.refreshTokenEncrypted).not.toContain("G-RT");
  });

  it("signs in with TikTok without PKCE", async () => {
    const { began, returned } = await startAndCallback("tiktok");
    expect(began.headers.get("set-cookie")).toBeNull();
    expect(new URL(began.headers.get("location")!).searchParams.get("client_key")).toBe("t-key");
    expect(new URL(returned.headers.get("location")!).searchParams.get("connected")).toBe("TikTok connected: Ada");
  });

  it("lists connections without ever showing tokens", async () => {
    const { listConnections } = await import("@/lib/oauth/connections");
    const list = await listConnections("owner-1");
    expect(list.map((item) => item.provider).sort()).toEqual(["google", "tiktok"]);
    expect(JSON.stringify(list)).not.toMatch(/G-AT|G-RT|T-AT|T-RT/);
    expect(await listConnections("owner-2")).toEqual([]);
  });

  it("signing in again as the same account updates it instead of adding a second one", async () => {
    await startAndCallback("tiktok");
    const { listConnections } = await import("@/lib/oauth/connections");
    expect((await listConnections("owner-1")).filter((item) => item.provider === "tiktok")).toHaveLength(1);
  });

  it("rejects a callback whose state belongs to someone else", async () => {
    const { GET: start } = await import("@/app/api/connections/[provider]/start/route");
    const { GET: callback } = await import("@/app/api/connections/[provider]/callback/route");
    const ctx = { params: Promise.resolve({ provider: "tiktok" }) };
    const began = await start(new Request("https://recatch.test/api/connections/tiktok/start"), ctx);
    const state = new URL(began.headers.get("location")!).searchParams.get("state")!;
    signedIn = "owner-2";
    const before = hits.length;
    const returned = await callback(new Request(`https://recatch.test/api/connections/tiktok/callback?code=C&state=${encodeURIComponent(state)}`), ctx);
    signedIn = "owner-1";
    expect(new URL(returned.headers.get("location")!).searchParams.get("error")).toMatch(/could not be verified/);
    expect(hits.length).toBe(before);
  });

  it("reports a cancelled sign-in and a missing server key without calling the provider", async () => {
    const { GET: callback } = await import("@/app/api/connections/[provider]/callback/route");
    const cancelled = await callback(new Request("https://recatch.test/api/connections/google/callback?error=access_denied"), { params: Promise.resolve({ provider: "google" }) });
    expect(new URL(cancelled.headers.get("location")!).searchParams.get("error")).toBe("YouTube sign-in was cancelled");

    const { GET: start } = await import("@/app/api/connections/[provider]/start/route");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const unset = await start(new Request("https://recatch.test/api/connections/google/start"), { params: Promise.resolve({ provider: "google" }) });
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "g-secret");
    expect(new URL(unset.headers.get("location")!).searchParams.get("error")).toMatch(/not set up on this server/);
  });

  it("hands out the stored token while it is fresh, and refreshes it once it is about to expire", async () => {
    const { listConnections, getAccessToken } = await import("@/lib/oauth/connections");
    const google = (await listConnections("owner-1")).find((item) => item.provider === "google")!;
    expect(await getAccessToken("owner-1", google.id)).toBe("G-AT-1");

    const later = Date.now() + 3600 * 1000 - 30 * 1000; // 30 seconds before it expires
    const refreshesBefore = hits.filter((hit) => hit.body.includes("grant_type=refresh_token")).length;
    expect(await getAccessToken("owner-1", google.id, { now: later })).toBe("G-AT-2");
    expect(hits.filter((hit) => hit.body.includes("grant_type=refresh_token")).length).toBe(refreshesBefore + 1);

    // Google does not send a new refresh token; the old one is kept, and the new access token is stored.
    const { getDb } = await import("@/lib/db");
    const { oauthConnections } = await import("@/lib/db/schema");
    const [row] = await (await getDb()).select().from(oauthConnections).where(eq(oauthConnections.id, google.id));
    expect(row.refreshTokenEncrypted).toBeTruthy();
    expect(await getAccessToken("owner-1", google.id)).toBe("G-AT-2");
  });

  it("marks a connection as needing a reconnect when the provider refuses the refresh", async () => {
    const { listConnections, getAccessToken } = await import("@/lib/oauth/connections");
    const tiktok = (await listConnections("owner-1")).find((item) => item.provider === "tiktok")!;
    refreshShouldFail = true;
    // TikTok's fake refresh also goes through the token endpoint, which returns a normal success; force a failure.
    vi.stubGlobal("fetch", vi.fn(async () => respond({ error: "invalid_grant", error_description: "Refresh token expired" })));
    const later = Date.now() + 86400 * 1000;
    await expect(getAccessToken("owner-1", tiktok.id, { now: later })).rejects.toThrow("Refresh token expired");
    const after = (await listConnections("owner-1")).find((item) => item.id === tiktok.id)!;
    expect(after.status).toBe("needs_reconnect");
    expect(after.lastError).toBe("TikTok refused the request: Refresh token expired");
    await expect(getAccessToken("owner-1", tiktok.id)).rejects.toThrow("needs to be reconnected");
    vi.stubGlobal("fetch", fakeProviders());
    refreshShouldFail = false;
  });

  it("keeps one user from using or removing another user's connection", async () => {
    const { listConnections, getAccessToken, disconnectConnection } = await import("@/lib/oauth/connections");
    const google = (await listConnections("owner-1")).find((item) => item.provider === "google")!;
    await expect(getAccessToken("owner-2", google.id)).rejects.toThrow("not found");
    expect(await disconnectConnection("owner-2", google.id)).toBe(false);

    const { DELETE } = await import("@/app/api/connections/item/[id]/route");
    signedIn = "owner-2";
    expect((await DELETE(new Request("https://recatch.test/x"), { params: Promise.resolve({ id: google.id }) })).status).toBe(404);
    signedIn = "owner-1";
    expect((await DELETE(new Request("https://recatch.test/x"), { params: Promise.resolve({ id: google.id }) })).status).toBe(200);
    expect((await listConnections("owner-1")).some((item) => item.id === google.id)).toBe(false);
  });
});
