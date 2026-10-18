import { json } from "@/lib/http";
import { log } from "@/lib/logger";
import { verifyStripeSignature } from "@/lib/stripe";
import { handleBillingEvent } from "@/lib/billing/webhook";

export const dynamic = "force-dynamic";

/** Stripe → Recatch subscriptions. Public; authenticated by the signing secret, not a session. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return json({ error: "Billing webhook is not configured" }, 503);
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) {
    return json({ error: "Bad signature" }, 400);
  }
  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  try {
    return json(await handleBillingEvent(event));
  } catch (error) {
    log.error("Billing webhook failed", error instanceof Error ? error.message : error);
    return json({ error: "Could not process billing event" }, 500);
  }
}
