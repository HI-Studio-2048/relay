import { and, eq } from "drizzle-orm";
import { recordConversion } from "@/lib/conversions";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots, contacts } from "@/lib/db/schema";
import { json, type RouteParams } from "@/lib/http";
import { log } from "@/lib/logger";
import { addContactTag } from "@/lib/store";
import { readStripe, stripeAmount, verifyStripeSignature } from "@/lib/stripe";

/**
 * Stripe → Relay: a completed Checkout (Payment Link) whose client_reference_id is a Relay contact id
 * becomes a goal with the amount paid, credited to the flow that sent the link, plus a tag.
 * Public route; authenticated by the Stripe signature.
 */
type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: { client_reference_id?: string | null; amount_total?: number | null; currency?: string; payment_status?: string } };
};

export async function POST(request: Request, context: RouteParams<{ botId: string }>) {
  const { botId } = await context.params;
  try {
    const raw = await request.text();
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    const stripe = readStripe(bot?.settings);
    if (!bot || !stripe.webhookSecretEncrypted) return json({ error: "Not configured" }, 404);
    if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), decryptSecret(stripe.webhookSecretEncrypted))) {
      return json({ error: "Bad signature" }, 400);
    }
    let event: StripeEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ error: "Bad JSON" }, 400);
    }
    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return json({ ok: true, ignored: event.type });
    const session = event.data?.object;
    // "no_payment_required" (100% coupon, free trial) is complete; "unpaid" waits for async_payment_succeeded.
    if (event.type === "checkout.session.completed" && session?.payment_status && !["paid", "no_payment_required"].includes(session.payment_status)) {
      return json({ ok: true, pending: true });
    }
    const contactId = session?.client_reference_id ?? "";
    const [contact] = contactId ? await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.botId, botId))).limit(1) : [];
    if (!contact) return json({ ok: true, unmatched: true });
    const value = typeof session?.amount_total === "number" ? stripeAmount(session.amount_total, session.currency) : null;
    // Stripe delivers at least once and retries: the event id is claimed with the goal, atomically.
    const { duplicate } = await recordConversion({
      botId,
      contactId,
      name: stripe.goalName,
      value,
      currency: session?.currency?.toLowerCase() ?? null,
      claim: event.id ? { source: "stripe", eventId: event.id } : undefined,
    });
    if (duplicate) return json({ ok: true, duplicate: true });
    // The goal is recorded: a failure past this point must not make Stripe retry (and count it twice).
    if (stripe.tag) await addContactTag(botId, contactId, stripe.tag).catch((error) => log.warn("Stripe tag failed", error instanceof Error ? error.message : error));
    return json({ ok: true });
  } catch (error) {
    log.warn("Stripe conversion failed", error instanceof Error ? error.message : error);
    return json({ error: "Could not record" }, 500);
  }
}
