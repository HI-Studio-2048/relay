import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** What scripts/bluesky-keygen.mjs prints: a private P-256 key as a JWK with a kid. */
function makeKey() {
  const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
  return { ...jwk, kid: "recatch-test", alg: "ES256" };
}

describe("Sign in with Bluesky settings", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-bsky-oauth-")));
    // Start the database in setup (30 seconds), not in the first test (20), so a busy run does not time out.
    await (await import("@/lib/db")).getDb();
  });
  afterAll(() => vi.unstubAllEnvs());

  it("is configured only with a usable private key and an https address", async () => {
    const { blueskyOauthConfigured } = await import("@/lib/channels/bluesky-oauth");
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubEnv("BLUESKY_OAUTH_KEY", "");
    expect(blueskyOauthConfigured()).toBe(false);
    vi.stubEnv("BLUESKY_OAUTH_KEY", "not json");
    expect(blueskyOauthConfigured()).toBe(false);
    const { d: _private, ...publicOnly } = makeKey();
    vi.stubEnv("BLUESKY_OAUTH_KEY", JSON.stringify(publicOnly));
    expect(blueskyOauthConfigured()).toBe(false);
    vi.stubEnv("BLUESKY_OAUTH_KEY", JSON.stringify(makeKey()));
    expect(blueskyOauthConfigured()).toBe(true);
    vi.stubEnv("PUBLIC_URL", "http://recatch.test");
    expect(blueskyOauthConfigured()).toBe(false);
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
  });

  it("describes Recatch to Bluesky: its client id is the address of this document, it signs with a key and asks for DMs", async () => {
    const { blueskyClientMetadata, BLUESKY_SCOPE } = await import("@/lib/channels/bluesky-oauth");
    const metadata = blueskyClientMetadata("https://recatch.test/");
    expect(metadata).toMatchObject({
      client_id: "https://recatch.test/api/bluesky/client-metadata.json",
      redirect_uris: ["https://recatch.test/api/bluesky/oauth/callback"],
      jwks_uri: "https://recatch.test/api/bluesky/jwks.json",
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      dpop_bound_access_tokens: true,
      grant_types: ["authorization_code", "refresh_token"],
    });
    expect(metadata.scope).toBe(BLUESKY_SCOPE);
    expect(BLUESKY_SCOPE.split(" ")).toEqual(["atproto", "transition:generic", "transition:chat.bsky"]);
  });

  it("serves the metadata document and a key list that never contains the private key", async () => {
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubEnv("BLUESKY_OAUTH_KEY", JSON.stringify(makeKey()));
    const { GET: metadata } = await import("@/app/api/bluesky/client-metadata.json/route");
    const doc = (await (await metadata()).json()) as { client_id: string };
    expect(doc.client_id).toBe("https://recatch.test/api/bluesky/client-metadata.json");

    const { GET: jwks } = await import("@/app/api/bluesky/jwks.json/route");
    const response = await jwks();
    expect(response.status).toBe(200);
    const text = await response.text();
    const keys = (JSON.parse(text) as { keys: Record<string, unknown>[] }).keys;
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: "EC", crv: "P-256", kid: "recatch-test" });
    expect(keys[0]).not.toHaveProperty("d");
    expect(text).not.toContain(String(makeKey().d).slice(0, 8));
  });

  it("refuses to serve keys when sign in is not set up", async () => {
    vi.stubEnv("BLUESKY_OAUTH_KEY", "");
    const { GET: jwks } = await import("@/app/api/bluesky/jwks.json/route");
    expect((await jwks()).status).toBe(503);
  });
});

describe("Bluesky OAuth session storage", () => {
  it("keeps sessions encrypted, hands them back, and forgets them", async () => {
    const { blueskySessionStore } = await import("@/lib/channels/bluesky-oauth");
    const { getDb } = await import("@/lib/db");
    const { blueskyOauthStore } = await import("@/lib/db/schema");
    const session = { dpopJwk: { kty: "EC", d: "private-part-of-the-key" }, tokenSet: { access_token: "ACCESS-TOKEN-VALUE", refresh_token: "REFRESH-TOKEN-VALUE" } };
    await blueskySessionStore.set("did:plc:ada", session as never);
    expect(await blueskySessionStore.get("did:plc:ada")).toEqual(session);

    const rows = await (await getDb()).select().from(blueskyOauthStore);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe("session:did:plc:ada");
    for (const secret of ["ACCESS-TOKEN-VALUE", "REFRESH-TOKEN-VALUE", "private-part-of-the-key"]) expect(rows[0]!.valueEncrypted).not.toContain(secret);

    await blueskySessionStore.del("did:plc:ada");
    expect(await blueskySessionStore.get("did:plc:ada")).toBeUndefined();
  });

  it("drops sign-ins that were started more than an hour ago, and only those", async () => {
    const { blueskyStateStore, blueskySessionStore } = await import("@/lib/channels/bluesky-oauth");
    const { getDb } = await import("@/lib/db");
    const { blueskyOauthStore } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await blueskyStateStore.set("old", { iss: "x" } as never);
    await blueskySessionStore.set("did:plc:keep", { dpopJwk: {} } as never);
    const db = await getDb();
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.update(blueskyOauthStore).set({ updatedAt: longAgo }).where(eq(blueskyOauthStore.key, "state:old"));
    await db.update(blueskyOauthStore).set({ updatedAt: longAgo }).where(eq(blueskyOauthStore.key, "session:did:plc:keep"));

    await blueskyStateStore.set("fresh", { iss: "y" } as never);
    expect(await blueskyStateStore.get("old")).toBeUndefined();
    expect(await blueskyStateStore.get("fresh")).toEqual({ iss: "y" });
    // A live session is never swept, however old.
    expect(await blueskySessionStore.get("did:plc:keep")).toEqual({ dpopJwk: {} });
  });

  it("returns nothing, not an error, for a stored value it cannot decrypt", async () => {
    const { blueskySessionStore } = await import("@/lib/channels/bluesky-oauth");
    const { getDb } = await import("@/lib/db");
    const { blueskyOauthStore } = await import("@/lib/db/schema");
    await (await getDb()).insert(blueskyOauthStore).values({ key: "session:did:plc:broken", valueEncrypted: "not-encrypted" });
    expect(await blueskySessionStore.get("did:plc:broken")).toBeUndefined();
  });
});
