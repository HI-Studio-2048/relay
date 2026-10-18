import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/billing/access";
import { getPlan } from "@/lib/billing/quote";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { emailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { publicUrl } from "@/lib/env";

export type AccountBilling = {
  id: string;
  email: string;
  name: string;
  billingStatus: string;
  planId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export async function loadAccountBilling(userId: string): Promise<AccountBilling | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      billingStatus: users.billingStatus,
      planId: users.planId,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** Customer id first (the Stripe object we stored), then the user id we put on the Checkout session. */
export async function findBillingUser(hints: { userId?: string | null; customerId?: string | null }): Promise<string | null> {
  const db = await getDb();
  if (hints.customerId) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, hints.customerId)).limit(1);
    if (row) return row.id;
  }
  if (hints.userId) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, hints.userId)).limit(1);
    if (row) return row.id;
  }
  return null;
}

function workspaceReadyMail(name: string) {
  const origin = publicUrl();
  return renderEmail({
    heading: name ? `Your Recatch workspace is ready, ${name}` : "Your Recatch workspace is ready",
    paragraphs: ["Payment is confirmed. Connect a channel and your first automation can be live in a few minutes."],
    ...(origin ? { action: { label: "Open Recatch", url: `${origin}/setup` } } : {}),
  });
}

/**
 * Write the subscription we heard about from Stripe. The welcome email goes out once,
 * on the transition into `active`, so a retried webhook does not mail twice.
 */
export async function saveBilling(input: {
  userId: string;
  billingStatus: "active" | "past_due" | "canceled" | "none";
  planId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}): Promise<{ access: boolean }> {
  const db = await getDb();
  const [current] = await db
    .select({
      email: users.email,
      name: users.name,
      billingStatus: users.billingStatus,
      planId: users.planId,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!current) return { access: false };
  const planId = input.planId && getPlan(input.planId) ? input.planId : current.planId;
  await db
    .update(users)
    .set({
      billingStatus: input.billingStatus,
      planId,
      stripeCustomerId: input.stripeCustomerId || current.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId || current.stripeSubscriptionId,
    })
    .where(eq(users.id, input.userId));
  const becameActive = current.billingStatus !== "active" && input.billingStatus === "active";
  if (becameActive && emailConfigured()) {
    void sendEmail({ to: current.email, subject: "Your Recatch workspace is ready", ...workspaceReadyMail(current.name) });
  }
  return { access: hasWorkspaceAccess(input.billingStatus) };
}

export async function rememberStripeCustomer(userId: string, customerId: string) {
  const db = await getDb();
  await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
}
