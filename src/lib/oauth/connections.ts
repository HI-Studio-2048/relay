import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { oauthConnections } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { isProviderId, OAuthError, refreshTokens, type Profile, type ProviderId, type TokenSet } from "@/lib/oauth/providers";

type Row = typeof oauthConnections.$inferSelect;
type Fetcher = typeof fetch;

/** What the UI and API may see about a connection. Never the tokens. */
export type PublicConnection = {
  id: string;
  provider: ProviderId;
  externalAccountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  status: "connected" | "needs_reconnect";
  lastError: string | null;
  connectedAt: string;
};

function toPublic(row: Row): PublicConnection {
  return {
    id: row.id,
    provider: isProviderId(row.provider) ? row.provider : "google",
    externalAccountId: row.externalAccountId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    scopes: row.scopes.split(" ").filter(Boolean),
    status: row.status === "needs_reconnect" ? "needs_reconnect" : "connected",
    lastError: row.lastError,
    connectedAt: row.createdAt.toISOString(),
  };
}

export async function listConnections(ownerId: string): Promise<PublicConnection[]> {
  const db = await getDb();
  const rows = await db.select().from(oauthConnections).where(eq(oauthConnections.ownerId, ownerId));
  return rows.filter((row) => isProviderId(row.provider)).map(toPublic).sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
}

/** Store a signed-in account. Signing in again as the same account updates it in place. */
export async function saveConnection(input: { ownerId: string; provider: ProviderId; profile: Profile; tokens: TokenSet }): Promise<PublicConnection> {
  const db = await getDb();
  const { ownerId, provider, profile, tokens } = input;
  const [existing] = await db
    .select()
    .from(oauthConnections)
    .where(and(eq(oauthConnections.ownerId, ownerId), eq(oauthConnections.provider, provider), eq(oauthConnections.externalAccountId, profile.externalId)))
    .limit(1);
  const values = {
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    scopes: tokens.scopes,
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    // A repeat sign-in does not always return a refresh token; keep the one we have.
    refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : existing?.refreshTokenEncrypted ?? null,
    expiresAt: tokens.expiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt ?? existing?.refreshExpiresAt ?? null,
    status: "connected",
    lastError: null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(oauthConnections).set(values).where(eq(oauthConnections.id, existing.id));
    return toPublic({ ...existing, ...values });
  }
  const id = crypto.randomUUID();
  const [row] = await db.insert(oauthConnections).values({ id, ownerId, provider, externalAccountId: profile.externalId, ...values }).returning();
  return toPublic(row!);
}

/**
 * Delete a connection and tell the provider to drop the grant, so the account stops showing Recatch as
 * having access. A failed revoke is logged, not fatal: the tokens are gone from Recatch either way.
 */
export async function disconnectConnection(ownerId: string, id: string, fetcher: Fetcher = fetch): Promise<boolean> {
  const db = await getDb();
  const removed = await db.delete(oauthConnections).where(and(eq(oauthConnections.id, id), eq(oauthConnections.ownerId, ownerId))).returning();
  const row = removed[0];
  if (row && row.provider === "google") {
    const grant = row.refreshTokenEncrypted ?? row.accessTokenEncrypted;
    try {
      await fetcher("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(grant) }),
      });
    } catch (error) {
      log.warn("Google revoke failed", error instanceof Error ? error.message : error);
    }
  }
  return removed.length > 0;
}

/** Refreshes already underway in this process, so two callers do not both spend a rotating refresh token. */
const refreshing = new Map<string, Promise<string>>();

const EXPIRY_MARGIN_MS = 60_000;

/**
 * A usable access token for a connection, refreshing it first when it is about to expire. This is what
 * anything that calls the provider's API (a feature, an agent tool) should use. A refresh that the
 * provider refuses marks the connection "needs reconnect" so the UI can say so.
 */
export async function getAccessToken(ownerId: string, id: string, options: { fetcher?: Fetcher; now?: number } = {}): Promise<string> {
  const now = options.now ?? Date.now();
  const db = await getDb();
  const [row] = await db.select().from(oauthConnections).where(and(eq(oauthConnections.id, id), eq(oauthConnections.ownerId, ownerId))).limit(1);
  if (!row || !isProviderId(row.provider)) throw new OAuthError("Connection not found");
  if (row.status === "needs_reconnect") throw new OAuthError("This connection needs to be reconnected");
  if (!row.expiresAt || row.expiresAt.getTime() - now > EXPIRY_MARGIN_MS) return decryptSecret(row.accessTokenEncrypted);

  const pending = refreshing.get(id);
  if (pending) return pending;
  const work = (async () => {
    const fail = async (message: string): Promise<never> => {
      await db.update(oauthConnections).set({ status: "needs_reconnect", lastError: message, updatedAt: new Date() }).where(eq(oauthConnections.id, id));
      throw new OAuthError(message);
    };
    if (!row.refreshTokenEncrypted) return fail("The access token expired and there is no refresh token");
    if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() < now) return fail("The sign-in expired, so it needs to be reconnected");
    let fresh: TokenSet;
    try {
      fresh = await refreshTokens(row.provider as ProviderId, decryptSecret(row.refreshTokenEncrypted), options.fetcher, now);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Could not refresh the sign-in");
    }
    await db
      .update(oauthConnections)
      .set({
        accessTokenEncrypted: encryptSecret(fresh.accessToken),
        refreshTokenEncrypted: fresh.refreshToken ? encryptSecret(fresh.refreshToken) : row.refreshTokenEncrypted,
        expiresAt: fresh.expiresAt,
        refreshExpiresAt: fresh.refreshExpiresAt ?? row.refreshExpiresAt,
        status: "connected",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, id));
    return fresh.accessToken;
  })().finally(() => refreshing.delete(id));
  refreshing.set(id, work);
  return work;
}

/** The same, for code that holds a connection id but not the owner (the YouTube channel, which stores the id). */
export async function getConnectionAccessToken(id: string, options: { fetcher?: Fetcher; now?: number } = {}): Promise<string> {
  const db = await getDb();
  const [row] = await db.select({ ownerId: oauthConnections.ownerId }).from(oauthConnections).where(eq(oauthConnections.id, id)).limit(1);
  if (!row) throw new OAuthError("The Google sign-in for this channel is gone. Connect YouTube again.");
  return getAccessToken(row.ownerId, id, options);
}
