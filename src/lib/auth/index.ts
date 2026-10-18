import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { bots, teamMembers, users } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { USER_HEADER } from "@/lib/auth/session";
import { workspaceGate } from "@/lib/billing/gate";
import { getPlan } from "@/lib/billing/quote";

/** Thrown when the caller is signed out (401) or reaches for something they don't own (404). */
export class AccessError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 402 | 404,
  ) {
    super(message);
  }
}

export type PublicUser = { id: string; email: string; name: string; createdAt: string };

function publicUser(row: typeof users.$inferSelect): PublicUser {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt.toISOString() };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const globalForAuth = globalThis as unknown as { relayOwnerReady?: Promise<void> };

/**
 * Make sure the workspace owner from RELAY_OWNER_EMAIL / RELAY_OWNER_PASSWORD exists, and hand them
 * every channel account connected before logins existed. Runs once per process; never resets a password.
 */
export function ensureOwnerAccount(): Promise<void> {
  globalForAuth.relayOwnerReady ??= (async () => {
    const email = process.env.RELAY_OWNER_EMAIL?.trim();
    const password = process.env.RELAY_OWNER_PASSWORD;
    if (!email || !password) return;
    const db = await getDb();
    let [owner] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
    if (!owner) {
      [owner] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          email: normalizeEmail(email),
          name: process.env.RELAY_OWNER_NAME?.trim() ?? "",
          passwordHash: await hashPassword(password),
          billingStatus: "active",
        })
        .returning();
      log.info("Created workspace owner account");
    }
    const claimed = await db
      .update(bots)
      .set({ ownerId: owner!.id })
      .where(isNull(bots.ownerId))
      .returning();
    if (claimed.length) log.info(`Assigned ${claimed.length} existing account(s) to the owner`);
    await db.update(teamMembers).set({ ownerId: owner!.id }).where(isNull(teamMembers.ownerId));
    // The company owner is not a new signup. Keep the workspace open unless they are on a real subscription that lapsed.
    if (owner!.billingStatus !== "active" && !owner!.stripeSubscriptionId) {
      await db.update(users).set({ billingStatus: "active" }).where(eq(users.id, owner!.id));
    }
  })().catch((error) => {
    globalForAuth.relayOwnerReady = undefined;
    throw error;
  });
  return globalForAuth.relayOwnerReady;
}

export async function createUser(input: { email: string; password: string; name?: string; planId?: string | null }): Promise<PublicUser> {
  const email = normalizeEmail(input.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  await ensureOwnerAccount();
  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new Error("An account with that email already exists");
  const [row] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email,
      name: input.name?.trim() ?? "",
      passwordHash: await hashPassword(input.password),
      billingStatus: "none",
      planId: getPlan(input.planId)?.id ?? null,
    })
    .returning();
  return publicUser(row!);
}

/** Returns the user when the credentials match; same error either way so emails can't be probed. */
export async function authenticate(email: string, password: string): Promise<PublicUser> {
  await ensureOwnerAccount();
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new AccessError("Wrong email or password", 401);
  }
  return publicUser(row);
}

/** The signed-in user id, as verified by proxy.ts. Null on public routes. */
export async function currentUserId(): Promise<string | null> {
  return (await headers()).get(USER_HEADER);
}

export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new AccessError("Sign in to continue", 401);
  const gate = await workspaceGate(id);
  if (gate === "missing") throw new AccessError("Sign in to continue", 401);
  if (gate === "unpaid") throw new AccessError("Finish checkout to open your workspace", 402);
  return id;
}

export async function currentUser(): Promise<PublicUser | null> {
  const id = await currentUserId();
  if (!id) return null;
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? publicUser(row) : null;
}

/** Throws unless the signed-in user owns this channel account. */
export async function requireBotAccess(botId: string | null | undefined): Promise<string> {
  const userId = await requireUserId();
  if (!botId) throw new AccessError("Account not found", 404);
  const db = await getDb();
  const [row] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.ownerId, userId)))
    .limit(1);
  if (!row) throw new AccessError("Account not found", 404);
  return userId;
}
