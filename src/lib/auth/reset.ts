import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { signFor } from "@/lib/auth/session";
import { safeEqual } from "@/lib/crypto";

/**
 * Password reset links without a table: `<userId>.<expiresMs>.<fingerprint>.<hmac>`. The fingerprint is a
 * slice of the current password hash, so the link stops working the moment the password changes (single use).
 */
export const RESET_MAX_AGE_MS = 60 * 60 * 1000;

const fingerprint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);

function makeToken(userId: string, passwordHash: string, now: number) {
  const payload = `${userId}.${now + RESET_MAX_AGE_MS}.${fingerprint(passwordHash)}`;
  return `${payload}.${signFor("reset", payload)}`;
}

/** The reset token for this email, or null when no such account. Callers must not reveal which. */
export async function resetTokenFor(email: string, now = Date.now()): Promise<{ token: string; name: string; email: string } | null> {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return row ? { token: makeToken(row.id, row.passwordHash, now), name: row.name, email: row.email } : null;
}

export class ResetError extends Error {}

/** Sets the new password when the token is authentic, unexpired and unused. Returns the user id. */
export async function resetPassword(token: string, password: string, now = Date.now()): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new ResetError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const invalid = new ResetError("This reset link is invalid or has expired. Ask for a new one.");
  const parts = token.split(".");
  if (parts.length !== 4) throw invalid;
  const [userId, expires, print, signature] = parts as [string, string, string, string];
  if (!userId || !/^\d+$/.test(expires) || Number(expires) < now) throw invalid;
  if (!safeEqual(signature, signFor("reset", `${userId}.${expires}.${print}`))) throw invalid;
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row || fingerprint(row.passwordHash) !== print) throw invalid;
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId));
  return userId;
}
