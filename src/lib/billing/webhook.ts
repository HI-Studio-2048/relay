import { billingStatusFromStripe, hasWorkspaceAccess } from "@/lib/billing/access";
import { findBillingUser, loadAccountBilling, saveBilling } from "@/lib/billing/account";
import { invoiceIsPaid, invoiceSubscriptionId, invoiceSubscriptionMetadata } from "@/lib/billing/invoice";
import { recordBillingPayment } from "@/lib/billing/payments";
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

function minorAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function currencyOf(source: StripeObject): string | null {
  const code = text(source.currency);
  return code ? code.toLowerCase().slice(0, 12) : null;
}

async function userFor(source: StripeObject, extraUserId?: string | null): Promise<string | null> {
  const meta = metadata(source);
  return findBillingUser({
    customerId: stripeId(source.customer),
    userId: extraUserId ?? text(meta.user_id) ?? text(source.client_reference_id),
  });
}

/** Stripe gave up, or money came back (refund, dispute, fraud warning). Closes the workspace and pauses automations. */
async function suspend(userId: string) {
  await saveBilling({ userId, billingStatus: "unpaid" });
}

/**
 * True when the event is about a subscription other than the one on file while that one still
 * gives access: an old subscription, or a second one from a double checkout. Those events must
 * not change the account (a cancelled duplicate would otherwise close a paid workspace).
 */
async function foreignSubscription(userId: string, subscriptionId: string | null): Promise<boolean> {
  if (!subscriptionId) return false;
  const account = await loadAccountBilling(userId);
  if (!account?.stripeSubscriptionId || account.stripeSubscriptionId === subscriptionId) return false;
  if (!hasWorkspaceAccess(account.billingStatus)) return false;
  log.warn("Stripe event for a subscription that isn't the account's current one", subscriptionId);
  return true;
}

async function customerFromCharge(chargeId: string | null): Promise<string | null> {
  if (!chargeId || !/^ch_[A-Za-z0-9_]+$/.test(chargeId)) return null;
  const charge = await stripeRequest("GET", `/charges/${encodeURIComponent(chargeId)}`);
  return stripeId(charge.customer);
}

/**
 * Subscription state lives here, not on the browser's return page. A Checkout session opens the
 * workspace only once Stripe reports `payment_status=paid` (including `async_payment_succeeded`).
 * `unpaid` and `no_payment_required` leave it closed. A failed renewal only marks it `past_due`
 * (still open) while Stripe retries the card. Stripe giving up (`unpaid`), a cancellation, a full
 * refund, a dispute or an early fraud warning closes it.
 *
 * The plan comes from Checkout metadata (`plan_id`) and the price lookup key. Charged amounts
 * are stored on the payment row only: tax and Adaptive Pricing change them.
 */
export async function handleBillingEvent(event: StripeEvent): Promise<{ ok: true; ignored?: boolean }> {
  const object = objectOf(event);
  const type = event.type ?? "";

  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    if (text(object.mode) && object.mode !== "subscription") return { ok: true, ignored: true };
    // Bank debits stay `unpaid` until async_payment_succeeded. A 100% discount is
    // `no_payment_required` and is not a payment, so it does not open the workspace.
    if (object.payment_status !== "paid") return { ok: true, ignored: true };
    const userId = await userFor(object);
    if (!userId) return { ok: true, ignored: true };
    const subscription = object.subscription && typeof object.subscription === "object" ? (object.subscription as StripeObject) : null;
    const stripeStatus = text(subscription?.status) ?? "active";
    const planId = text(metadata(object).plan_id) ?? (subscription ? text(metadata(subscription).plan_id) : null);
    const subscriptionId = stripeId(object.subscription);
    if (await foreignSubscription(userId, subscriptionId)) {
      // A second paid Checkout. Keep the first subscription and leave the duplicate for a refund.
      log.warn("A second subscription was paid for one account, refund one of them in Stripe", userId);
      return { ok: true, ignored: true };
    }
    await saveBilling({
      userId,
      billingStatus: subscription && stripeStatus !== "active" ? billingStatusFromStripe(stripeStatus) : "active",
      planId,
      stripeCustomerId: stripeId(object.customer),
      stripeSubscriptionId: subscriptionId,
    });
    await recordBillingPayment({
      userId,
      invoiceId: stripeId(object.invoice),
      checkoutSessionId: text(object.id),
      subscriptionId,
      amountCents: minorAmount(object.amount_total),
      currency: currencyOf(object),
      billingReason: "subscription_create",
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
    if (await foreignSubscription(userId, text(object.id))) return { ok: true, ignored: true };
    const status = type === "customer.subscription.deleted" ? "canceled" : billingStatusFromStripe(text(object.status));
    await saveBilling({
      userId,
      // `incomplete` and friends say nothing about access. Stripe can deliver `subscription.created`
      // (still incomplete) after the paid Checkout, and it must not close a workspace just paid for.
      billingStatus: status === "none" ? undefined : status,
      planId: text(metadata(object).plan_id),
      stripeCustomerId: stripeId(object.customer),
      stripeSubscriptionId: text(object.id),
    });
    return { ok: true };
  }

  if (type === "invoice.paid" || type === "invoice.payment_failed") {
    const subscriptionId = invoiceSubscriptionId(object);
    if (!subscriptionId) return { ok: true, ignored: true };
    const subMeta = invoiceSubscriptionMetadata(object);
    const userId = await userFor(object, text(subMeta.user_id));
    if (!userId) return { ok: true, ignored: true };
    if (await foreignSubscription(userId, subscriptionId)) return { ok: true, ignored: true };
    if (type === "invoice.payment_failed") {
      // Stripe retries a failed renewal for days. The workspace stays open meanwhile, and closes
      // when the subscription itself turns `unpaid` or `canceled`.
      const account = await loadAccountBilling(userId);
      if (!account || !hasWorkspaceAccess(account.billingStatus)) return { ok: true, ignored: true };
      await saveBilling({ userId, billingStatus: "past_due" });
      return { ok: true };
    }
    if (!invoiceIsPaid(object)) return { ok: true, ignored: true };
    await saveBilling({
      userId,
      billingStatus: "active",
      planId: text(metadata(object).plan_id) ?? text(subMeta.plan_id),
      stripeCustomerId: stripeId(object.customer),
      stripeSubscriptionId: subscriptionId,
    });
    await recordBillingPayment({
      userId,
      invoiceId: text(object.id),
      checkoutSessionId: null,
      subscriptionId,
      amountCents: minorAmount(object.amount_paid),
      currency: currencyOf(object),
      billingReason: text(object.billing_reason) ?? "subscription_cycle",
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
