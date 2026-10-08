import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

/**
 * Stateless signed sessions: `<userId>.<expiresMs>.<hmac>`. Kept free of DB imports so proxy.ts can
 * verify the cookie on every request; routes then trust the `x-relay-user` header the proxy sets.
 */
export const SESSION_COOKIE = "relay_session";
export const USER_HEADER = "x-relay-user";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

const DEV_SECRET = "dev-only-relay-session-secret";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.ENCRYPTION_KEY?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (or ENCRYPTION_KEY) is required in production");
  }
  return DEV_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(`relay-session-v1:${payload}`).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_MAX_AGE_S * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id when the token is authentic and unexpired. */
export function verifySessionToken(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts as [string, string, string];
  if (!userId || !/^\d+$/.test(expires) || Number(expires) < now) return null;
  return safeEqual(signature, sign(`${userId}.${expires}`)) ? userId : null;
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_S}${secure}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
