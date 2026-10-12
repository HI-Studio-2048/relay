import { lt, eq, like, and } from "drizzle-orm";
import { JoseKey } from "@atproto/jwk-jose";
import { NodeOAuthClient, type NodeSavedSession, type NodeSavedState, type OAuthClientOptions, type RuntimeLock } from "@atproto/oauth-client-node";
import { fetchBlueskyHandle } from "@/lib/channels/bluesky";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { blueskyOauthStore } from "@/lib/db/schema";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * "Sign in with Bluesky": Recatch is a confidential OAuth client (it proves itself with a private key) so
 * a customer's session lasts months instead of days. The protocol (DPoP-bound tokens, rotating refresh
 * tokens, identity checks) is Bluesky's own client library; this file only supplies the settings, the key
 * and where sessions are kept.
 *
 * DMs need both transition scopes. transition:generic is broad on Bluesky's side, but Recatch only ever
 * reads direct messages and replies to them.
 */
export const BLUESKY_SCOPE = "atproto transition:generic transition:chat.bsky";

/** The private signing key (a JWK as JSON, made by scripts/bluesky-keygen.mjs). Null until it is set. */
function privateKey(): Record<string, unknown> | null {
  const raw = process.env.BLUESKY_OAUTH_KEY?.trim();
  if (!raw) return null;
  try {
    const jwk = JSON.parse(raw) as Record<string, unknown>;
    return jwk && typeof jwk === "object" && typeof jwk.kid === "string" && typeof jwk.d === "string" ? jwk : null;
  } catch {
    return null;
  }
}

/** True when the signing key is set and Recatch has a public https address Bluesky can read its metadata from. */
export function blueskyOauthConfigured(): boolean {
  const origin = publicUrl();
  return privateKey() !== null && Boolean(origin?.startsWith("https://"));
}

export function blueskyClientMetadata(origin: string): OAuthClientOptions["clientMetadata"] {
  const base = origin.replace(/\/$/, "");
  return {
    client_id: `${base}/api/bluesky/client-metadata.json`,
    client_name: "Recatch",
    client_uri: base,
    redirect_uris: [`${base}/api/bluesky/oauth/callback`],
    scope: BLUESKY_SCOPE,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    dpop_bound_access_tokens: true,
    application_type: "web",
    jwks_uri: `${base}/api/bluesky/jwks.json`,
  };
}

const STATE_TTL_MS = 60 * 60 * 1000;

/**
 * Pending sign-ins and live sessions, encrypted in the database. A session holds the access and refresh
 * tokens and the key the tokens are bound to, so it is never stored in the clear.
 */
function encryptedStore<V>(kind: "state" | "session", afterSet?: () => Promise<void>) {
  const key = (name: string) => `${kind}:${name}`;
  return {
    async get(name: string): Promise<V | undefined> {
      const db = await getDb();
      const [row] = await db.select().from(blueskyOauthStore).where(eq(blueskyOauthStore.key, key(name))).limit(1);
      if (!row) return undefined;
      try {
        return JSON.parse(decryptSecret(row.valueEncrypted)) as V;
      } catch {
        return undefined;
      }
    },
    async set(name: string, value: V): Promise<void> {
      const db = await getDb();
      const valueEncrypted = encryptSecret(JSON.stringify(value));
      await db
        .insert(blueskyOauthStore)
        .values({ key: key(name), valueEncrypted })
        .onConflictDoUpdate({ target: blueskyOauthStore.key, set: { valueEncrypted, updatedAt: new Date() } });
      await afterSet?.();
    },
    async del(name: string): Promise<void> {
      const db = await getDb();
      await db.delete(blueskyOauthStore).where(eq(blueskyOauthStore.key, key(name)));
    },
  };
}

async function dropOldStates() {
  const db = await getDb();
  await db.delete(blueskyOauthStore).where(and(like(blueskyOauthStore.key, "state:%"), lt(blueskyOauthStore.updatedAt, new Date(Date.now() - STATE_TTL_MS))));
}

export const blueskyStateStore = encryptedStore<NodeSavedState>("state", dropOldStates);
export const blueskySessionStore = encryptedStore<NodeSavedSession>("session");

/** One refresh at a time per account. A refresh token works once, so two at once would lock the account out. */
const locks = new Map<string, Promise<unknown>>();
const requestLock: RuntimeLock = async (name, fn) => {
  const previous = locks.get(name) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  locks.set(name, run);
  try {
    return await run;
  } finally {
    if (locks.get(name) === run) locks.delete(name);
  }
};

const store = globalThis as unknown as { __relayBlueskyOauth?: Promise<NodeOAuthClient> };

/** The one OAuth client for this server. Built on first use, because it needs the key and the public address. */
export function blueskyOauthClient(): Promise<NodeOAuthClient> {
  return (store.__relayBlueskyOauth ??= (async () => {
    const jwk = privateKey();
    const origin = publicUrl();
    if (!jwk || !origin) throw new Error("Sign in with Bluesky is not set up on this server yet");
    return new NodeOAuthClient({
      clientMetadata: blueskyClientMetadata(origin),
      keyset: [await JoseKey.fromImportable(jwk as never)],
      stateStore: blueskyStateStore,
      sessionStore: blueskySessionStore,
      requestLock,
    });
  })().catch((error) => {
    store.__relayBlueskyOauth = undefined;
    throw error;
  }));
}

/** The public half of the key, for Bluesky to check what Recatch signs. */
export async function blueskyPublicJwks() {
  return (await blueskyOauthClient()).jwks;
}

/** Where to send the person: Bluesky's own sign-in page. With no handle it starts at bsky.social, where they type it. */
export async function startBlueskySignIn(input: { handle?: string | null; state: string }): Promise<URL> {
  const client = await blueskyOauthClient();
  const handle = (input.handle ?? "").trim().replace(/^@/, "");
  return client.authorize(handle || "https://bsky.social", { scope: BLUESKY_SCOPE, state: input.state });
}

export type BlueskySignIn = { did: string; state: string | null };

/** Trade what Bluesky sent back for a stored session. Throws if Bluesky or the signature check says no. */
export async function finishBlueskySignIn(params: URLSearchParams): Promise<BlueskySignIn> {
  const client = await blueskyOauthClient();
  const { session, state } = await client.callback(params);
  return { did: session.did, state: state ?? null };
}

/** A working session for this account, refreshed when needed. Throws when the person has to sign in again. */
export async function restoreBlueskySession(did: string) {
  const client = await blueskyOauthClient();
  return client.restore(did);
}

/**
 * Make sure the account's session works and can read direct messages. Used when connecting and by the
 * health check. Throws a message that says what to do.
 */
export async function checkBlueskyOauthAccount(did: string): Promise<{ handle: string }> {
  let session;
  try {
    session = await restoreBlueskySession(did);
  } catch {
    throw new Error("Bluesky: the sign-in expired or was revoked. Reconnect the account with Sign in with Bluesky.");
  }
  const response = await session.fetchHandler("/xrpc/chat.bsky.convo.listConvos?limit=1", { headers: { "atproto-proxy": "did:web:api.bsky.chat#bsky_chat" } });
  if (!response.ok) {
    throw new Error("Bluesky did not allow Recatch to read direct messages. Sign in again and approve the direct messages permission.");
  }
  return { handle: (await fetchBlueskyHandle(did)) ?? did };
}

/** Sign out at Bluesky and forget the session. Best effort: the local copy goes either way. */
export async function revokeBlueskySession(did: string) {
  try {
    await (await blueskyOauthClient()).revoke(did);
  } catch (error) {
    log.warn("Could not revoke the Bluesky session", did, error instanceof Error ? error.message : error);
  }
  await blueskySessionStore.del(did).catch(() => undefined);
}
