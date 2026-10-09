import { createHash, createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

/** The cookie holding the PKCE verifier between "start" and "callback". Only the callback route reads it. */
export const VERIFIER_COOKIE = "rc_oauth_verifier";

/**
 * The `state` value that rides through a provider's consent screen and comes back on the callback.
 * It is signed, tied to the signed-in user and the provider, and expires, so a callback that was not
 * started by this user in the last ten minutes is rejected.
 */
const STATE_TTL_MS = 10 * 60 * 1000;
const DEV_SECRET = "dev-only-relay-session-secret";

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim() || process.env.ENCRYPTION_KEY?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (or ENCRYPTION_KEY) is required in production");
  return DEV_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`relay-oauth-state-v1:${payload}`).digest("base64url");
}

export function createState(userId: string, provider: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, p: provider, n: randomBytes(12).toString("base64url"), e: now + STATE_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export type StateCheck = { ok: true } | { ok: false; reason: "malformed" | "signature" | "expired" | "user" | "provider" };

export function verifyState(state: string | null | undefined, expected: { userId: string; provider: string }, now = Date.now()): StateCheck {
  const [payload, signature, extra] = (state ?? "").split(".");
  if (!payload || !signature || extra !== undefined) return { ok: false, reason: "malformed" };
  if (!safeEqual(signature, sign(payload))) return { ok: false, reason: "signature" };
  let data: { u?: string; p?: string; e?: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof data.e !== "number" || data.e < now) return { ok: false, reason: "expired" };
  if (data.u !== expected.userId) return { ok: false, reason: "user" };
  if (data.p !== expected.provider) return { ok: false, reason: "provider" };
  return { ok: true };
}

/** RFC 7636 code challenge for a verifier: base64url(SHA-256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: pkceChallenge(verifier) };
}
