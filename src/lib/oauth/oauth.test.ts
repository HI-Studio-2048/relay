import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  callbackUrl,
  exchangeCode,
  fetchProfile,
  isProviderId,
  OAuthError,
  providerConfigured,
  refreshTokens,
} from "@/lib/oauth/providers";
import { createPkce, createState, pkceChallenge, verifyState } from "@/lib/oauth/state";

const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

describe("OAuth state", () => {
  const T = 1_800_000_000_000;

  it("accepts the state it issued, for the same user and provider", () => {
    const state = createState("user-1", "google", T);
    expect(verifyState(state, { userId: "user-1", provider: "google" }, T + 1000)).toEqual({ ok: true });
  });

  it("rejects another user, another provider, an old state and a forged one", () => {
    const state = createState("user-1", "google", T);
    expect(verifyState(state, { userId: "user-2", provider: "google" }, T)).toEqual({ ok: false, reason: "user" });
    expect(verifyState(state, { userId: "user-1", provider: "tiktok" }, T)).toEqual({ ok: false, reason: "provider" });
    expect(verifyState(state, { userId: "user-1", provider: "google" }, T + 11 * 60 * 1000)).toEqual({ ok: false, reason: "expired" });

    const [payload] = state.split(".");
    expect(verifyState(`${payload}.forged`, { userId: "user-1", provider: "google" }, T)).toEqual({ ok: false, reason: "signature" });
    const swapped = Buffer.from(JSON.stringify({ u: "user-2", p: "google", n: "x", e: T + 1000 })).toString("base64url");
    expect(verifyState(`${swapped}.${state.split(".")[1]}`, { userId: "user-2", provider: "google" }, T).ok).toBe(false);
  });

  it("rejects missing and malformed state", () => {
    expect(verifyState(null, { userId: "u", provider: "google" })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyState("a.b.c", { userId: "u", provider: "google" })).toEqual({ ok: false, reason: "malformed" });
  });

  it("never issues the same state twice", () => {
    expect(createState("u", "google", T)).not.toBe(createState("u", "google", T));
  });
});

describe("PKCE", () => {
  it("matches the example in RFC 7636 appendix B", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("creates a verifier of valid length with its own challenge", () => {
    const { verifier, challenge } = createPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toBe(pkceChallenge(verifier));
  });
});

describe("providers", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "g-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "g-secret");
    vi.stubEnv("TIKTOK_CLIENT_KEY", "t-key");
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "t-secret");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("knows which providers exist and whether the server has their keys", () => {
    expect(isProviderId("google")).toBe(true);
    expect(isProviderId("myspace")).toBe(false);
    expect(providerConfigured("google")).toBe(true);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(providerConfigured("google")).toBe(false);
  });

  it("builds the callback URL from the public origin", () => {
    expect(callbackUrl("https://recatch.app/", "tiktok")).toBe("https://recatch.app/api/connections/tiktok/callback");
  });

  it("builds a Google sign-in URL with PKCE and offline access", () => {
    const url = new URL(buildAuthorizeUrl("google", { redirectUri: "https://recatch.app/api/connections/google/callback", state: "S", challenge: "C" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "g-id",
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      state: "S",
      access_type: "offline",
      prompt: "consent",
      code_challenge: "C",
      code_challenge_method: "S256",
    });
  });

  it("builds a TikTok sign-in URL with client_key, comma scopes and no PKCE", () => {
    const url = new URL(buildAuthorizeUrl("tiktok", { redirectUri: "https://recatch.app/api/connections/tiktok/callback", state: "S", challenge: "C" }));
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe("t-key");
    expect(url.searchParams.get("client_id")).toBeNull();
    expect(url.searchParams.get("scope")).toBe("user.info.basic");
    expect(url.searchParams.get("code_challenge")).toBeNull();
  });

  it("refuses to build a URL when the server has no keys", () => {
    vi.stubEnv("TIKTOK_CLIENT_KEY", "");
    expect(() => buildAuthorizeUrl("tiktok", { redirectUri: "https://x", state: "S" })).toThrow(OAuthError);
  });

  it("trades a Google code for tokens, sending the PKCE verifier", async () => {
    const fetcher = vi.fn(async () => respond({ access_token: "AT", refresh_token: "RT", expires_in: 3600, scope: "https://www.googleapis.com/auth/youtube.readonly" }));
    const tokens = await exchangeCode("google", { code: "CODE", redirectUri: "https://r", verifier: "V" }, fetcher, 1_000_000);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = init.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      client_id: "g-id",
      client_secret: "g-secret",
      code: "CODE",
      grant_type: "authorization_code",
      redirect_uri: "https://r",
      code_verifier: "V",
    });
    expect(tokens).toMatchObject({ accessToken: "AT", refreshToken: "RT", scopes: "https://www.googleapis.com/auth/youtube.readonly" });
    expect(tokens.expiresAt?.getTime()).toBe(1_000_000 + 3_600_000);
  });

  it("trades a TikTok code for tokens and reads the open id and refresh lifetime", async () => {
    const fetcher = vi.fn(async () =>
      respond({ access_token: "AT", refresh_token: "RT", expires_in: 86400, refresh_expires_in: 31536000, open_id: "OPEN", scope: "user.info.basic", token_type: "Bearer" }),
    );
    const tokens = await exchangeCode("tiktok", { code: "CODE", redirectUri: "https://r", verifier: "ignored" }, fetcher, 0);
    const body = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("client_key")).toBe("t-key");
    expect(body.get("code_verifier")).toBeNull();
    expect(tokens).toMatchObject({ externalId: "OPEN", scopes: "user.info.basic" });
    expect(tokens.refreshExpiresAt?.getTime()).toBe(31536000 * 1000);
  });

  it("treats an error body as a failure even on HTTP 200, as TikTok sends them", async () => {
    const fetcher = vi.fn(async () => respond({ error: "invalid_grant", error_description: "Authorization code is expired" }));
    await expect(exchangeCode("tiktok", { code: "OLD", redirectUri: "https://r" }, fetcher)).rejects.toThrow("Authorization code is expired");
  });

  it("refreshes with the refresh token", async () => {
    const fetcher = vi.fn(async () => respond({ access_token: "AT2", expires_in: 3600 }));
    const tokens = await refreshTokens("google", "RT", fetcher, 0);
    const body = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(Object.fromEntries(body)).toMatchObject({ grant_type: "refresh_token", refresh_token: "RT" });
    expect(tokens).toMatchObject({ accessToken: "AT2", refreshToken: null });
  });

  it("reads the TikTok account", async () => {
    const fetcher = vi.fn(async () => respond({ data: { user: { open_id: "OPEN", display_name: "Ada", avatar_url: "https://a" } }, error: { code: "ok" } }));
    const profile = await fetchProfile("tiktok", { accessToken: "AT", refreshToken: null, expiresAt: null, refreshExpiresAt: null, scopes: "", externalId: null }, fetcher);
    expect(profile).toEqual({ externalId: "OPEN", displayName: "Ada", avatarUrl: "https://a" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("open.tiktokapis.com/v2/user/info/");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer AT");
  });

  it("reads the YouTube channel, and says so when there is none", async () => {
    const tokens = { accessToken: "AT", refreshToken: null, expiresAt: null, refreshExpiresAt: null, scopes: "", externalId: null };
    const ok = vi.fn(async () => respond({ items: [{ id: "UC1", snippet: { title: "Studio", thumbnails: { default: { url: "https://t" } } } }] }));
    expect(await fetchProfile("google", tokens, ok)).toEqual({ externalId: "UC1", displayName: "Studio", avatarUrl: "https://t" });
    const none = vi.fn(async () => respond({ items: [] }));
    await expect(fetchProfile("google", tokens, none)).rejects.toThrow("no YouTube channel");
  });

  it("falls back to the open id from the token when TikTok omits it from the profile", async () => {
    const fetcher = vi.fn(async () => respond({ data: { user: { display_name: "Ada" } }, error: { code: "ok" } }));
    const profile = await fetchProfile("tiktok", { accessToken: "AT", refreshToken: null, expiresAt: null, refreshExpiresAt: null, scopes: "", externalId: "FROM_TOKEN" }, fetcher);
    expect(profile.externalId).toBe("FROM_TOKEN");
  });
});
