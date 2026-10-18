import { billingStatusFromStripe } from "@/lib/billing/access";
import { findBillingUser, saveBilling } from "@/lib/billing/account";
import { stripeId, stripeRequest, type StripeObject } from "@/lib/billing/stripe-api";
import { log } from "@/lib/logger";

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: StripeObject };
};

function objectOf(event: StripeEvent): StripeObject {
  return event.data?.object ?? {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function metadata(source: StripeObject): StripeObject {
  return source.metadata && typeof source.metadata === "object" ? (source.metadata as StripeObject) : {};
}

async function userFor(source: StripeObject, extraUserId?: string | null): Promise<string | null> {
  const meta = metadata(source);
  return findBillingUser({
    customerId: stripeId(source.customer),
    userId: extraUserId ?? text(meta.user_id) ?? text(source.client_reference_id),
  });
}

async function suspend(userId: string) {
  await saveBilling({ userId, billingStatus: "past_due" });
}

async function customerFromCharge(chargeId: string | null): Promise<string | null> {
  if (!chargeId || !/^ch_[A-Za-z0-9_]+$/.test(chargeId)) return null;
  const charge = await stripeRequest("GET", `/charges/${encodeURIComponent(chargeId)}`);
  return stripeId(charge.customer);
}

/**
 * Subscription state lives here, not on the browser's return page. A paid Checkout opens the
 * workspace; a failed invoice, a cancellation, a full refund, a dispute or an early fraud warning closes it.
 */
export async function handleBillingEvent(event: StripeEvent): Promise<{ ok: true; ignored?: boolean }> {
  const object = objectOf(event);
  const type = event.type ?? "";

  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    if (text(object.mode) && object.mode !== "subscription") return { ok: true, ignored: true };
    if (object.payment_status === "unpaid") return { ok: true, ignored: true };
    if (object.payment_status !== "paid" && object.payment_status !== "no_payment_required") return { ok: true, ignored: true };
    const userId = await userFor(object);
    if (!userId) return { ok: true, ignored: true };
    const subscription = object.subscription && typeof object.subscription === "object" ? (object.subscription as StripeObject) : null;
    const stripeStatus = text(subscription?.status) ?? "active";
    const planId = text(metadata(object).plan_id) ?? (subscription ? text(metadata(subscription).plan_id) : null);
    await saveBilling({
      userId,
      billingStatus: subscription && stripeStatus !== "active" ? billingStatusFromStripe(stripeStatus) : "active",
      planId,
      stripeCustomerId: stripeId(object.customer),
      stripeSubscriptionId: stripeId(object.subscription),
    });
    return { ok: true };
  }

  if (type === "checkout.session.async_payment_failed") {
    const userId = await userFor(object);
    if (userId) await suspend(userId);
    return { ok: true };
  }

  if (type === "customer.subscription.created" || type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    const userId = await userFor(object);
    if (!userId) return { ok: true, ignored: true };
    const status = type === "customer.subscription.deleted" ? "canceled" : billingStatusFromStripe(text(object.status));
    await saveBilling({
      userId,
      billingStatus: status,
      planId: text(metadata(object).plan_id),
      stripeCustomerId: stripeId(object.customer),
      stripeSubscriptionId: text(object.id),
    });
    return { ok: true };
  }

  if (type === "invoice.paid" || type === "invoice.payment_failed") {
    if (!stripeId(object.subscription)) return { ok: true, ignored: true };
    const userId = await userFor(object);
    if (!userId) return { ok: true, ignored: true };
    if (type === "invoice.payment_failed") {
      await suspend(userId);
      return { ok: true };
    }
    if (object.status !== "paid" && object.paid !== true) return { ok: true, ignored: true };
    await saveBilling({
      userId,
      billingStatus: "active",
      stripeCustomerId: stripeId(object.customer),
      stripeSubscriptionId: stripeId(object.subscription),
    });
    return { ok: true };
  }

  if (type === "charge.refunded") {
    if (object.refunded !== true) return { ok: true, ignored: true };
    const userId = await userFor(object);
    if (userId) await suspend(userId);
    return { ok: true };
  }

  if (type === "charge.dispute.created" || type === "radar.early_fraud_warning.created") {
    const customerId = await customerFromCharge(text(object.charge));
    const userId = customerId ? await findBillingUser({ customerId }) : null;
    if (!userId) return { ok: true, ignored: true };
    await suspend(userId);
    log.warn("Billing access held after a Stripe risk event", type);
    return { ok: true };
  }

  return { ok: true, ignored: true };
}
