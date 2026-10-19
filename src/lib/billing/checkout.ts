import { paymentsConfigured, automaticTaxEnabled } from "@/lib/billing/config";
import { BillingError } from "@/lib/billing/errors";
import { quotePlan } from "@/lib/billing/quote";
import { isStripeHost, stripeGetOptional, stripeId, stripeRequest, type StripeObject } from "@/lib/billing/stripe-api";
import { rememberStripeCustomer, saveBilling } from "@/lib/billing/account";
import { recordBillingPayment } from "@/lib/billing/payments";
import { billingStatusFromStripe } from "@/lib/billing/access";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";

const productIds = new Map<string, string>();
const priceIds = new Map<string, string>();

function randomSuffix() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => letters[byte % 26]).join("");
}

function lookupKey(planId: string, cents: number) {
  return `recatch_${planId}_month_${cents}`;
}

function couponId(percent: number) {
  return `recatch_launch_${percent}_once`;
}

async function ensureProduct(planId: string, name: string): Promise<string> {
  const cached = productIds.get(planId);
  if (cached) return cached;
  const query = new URLSearchParams({ query: `metadata['recatch_plan']:'${planId}'`, limit: "1" });
  try {
    const found = await stripeRequest("GET", `/products/search?${query.toString()}`);
    const existing = stripeId((found.data as StripeObject[] | undefined)?.[0]);
    if (existing) {
      productIds.set(planId, existing);
      return existing;
    }
  } catch (error) {
    if (!(error instanceof BillingError)) throw error;
  }
  const body = new URLSearchParams();
  body.set("name", `Recatch ${name}`);
  body.set("metadata[recatch_plan]", planId);
  const created = await stripeRequest("POST", "/products", body, `recatch-product-${planId}`);
  const id = stripeId(created);
  if (!id) throw new BillingError("Payment service did not return a product", 502);
  productIds.set(planId, id);
  return id;
}

async function ensurePrice(planId: string, name: string, cents: number): Promise<string> {
  const key = lookupKey(planId, cents);
  const cached = priceIds.get(key);
  if (cached) return cached;
  const listed = await stripeRequest("GET", `/prices?${new URLSearchParams({ "lookup_keys[]": key, active: "true", limit: "1" }).toString()}`);
  const existing = stripeId((listed.data as StripeObject[] | undefined)?.[0]);
  if (existing) {
    priceIds.set(key, existing);
    return existing;
  }
  const product = await ensureProduct(planId, name);
  const body = new URLSearchParams();
  body.set("product", product);
  body.set("unit_amount", String(cents));
  body.set("currency", "usd");
  body.set("recurring[interval]", "month");
  body.set("lookup_key", key);
  body.set("nickname", `${name} monthly`);
  body.set("metadata[plan_id]", planId);
  const created = await stripeRequest("POST", "/prices", body, `recatch-price-${key}`);
  const id = stripeId(created);
  if (!id) throw new BillingError("Payment service did not return a price", 502);
  priceIds.set(key, id);
  return id;
}

/** The shared launch coupon. Reused only when it is 50% off and duration `once`. */
const LAUNCH_COUPON_ID = "recatch_launch_50_once";

function couponIsPercentOnce(coupon: StripeObject, percent: number): boolean {
  const percentOff = typeof coupon.percent_off === "number" ? coupon.percent_off : Number(coupon.percent_off);
  return percentOff === percent && coupon.duration === "once" && coupon.valid !== false;
}

async function createCoupon(id: string, percent: number): Promise<string> {
  const body = new URLSearchParams();
  body.set("id", id);
  body.set("percent_off", String(percent));
  body.set("duration", "once");
  body.set("name", `${percent}% off the first month`);
  body.set("metadata[recatch]", "launch");
  await stripeRequest("POST", "/coupons", body, `recatch-coupon-${id}`);
  return id;
}

/**
 * Coupon duration `once`: the percent applies to the first invoice, then Stripe renews at the full price.
 * A 50% offer reuses `recatch_launch_50_once` when that coupon is already 50% off once.
 * Any other percent keeps the previous id (`recatch_launch_{percent}_once`), creating it if missing.
 */
async function ensureCoupon(percent: number): Promise<string> {
  const id = couponId(percent);
  const existing = await stripeGetOptional(`/coupons/${encodeURIComponent(id)}`);
  if (existing) {
    // The shared launch coupon is reused only when it is still 50% off once.
    // A different percent keeps the previous behavior and uses the coupon stored at its id.
    if (id === LAUNCH_COUPON_ID && !couponIsPercentOnce(existing, 50)) {
      throw new BillingError("The launch coupon isn't 50% off the first month", 502);
    }
    return id;
  }
  return createCoupon(id, percent);
}

async function ensureCustomer(input: { userId: string; email: string; name: string; customerId: string | null }): Promise<string> {
  if (input.customerId) return input.customerId;
  const body = new URLSearchParams();
  body.set("email", input.email);
  if (input.name.trim()) body.set("name", input.name.trim());
  body.set("metadata[user_id]", input.userId);
  const created = await stripeRequest("POST", "/customers", body, `recatch-customer-${input.userId}`);
  const id = stripeId(created);
  if (!id) throw new BillingError("Payment service did not return a customer", 502);
  await rememberStripeCustomer(input.userId, id);
  return id;
}

export async function startCheckout(input: { userId: string; email: string; name: string; planId: string; customerId: string | null }): Promise<string> {
  if (!paymentsConfigured()) throw new BillingError("Checkout isn't available yet", 503);
  const quote = quotePlan(input.planId);
  if (!quote) throw new BillingError("Choose a plan to continue", 400);
  const origin = publicUrl();
  if (!origin) throw new BillingError("Checkout isn't available yet", 503);
  const customer = await ensureCustomer(input);
  const price = await ensurePrice(quote.plan.id, quote.plan.name, quote.regularCents);
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", customer);
  body.set("client_reference_id", input.userId);
  body.set("success_url", `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", `${origin}/billing?canceled=1&plan=${encodeURIComponent(quote.plan.id)}`);
  body.set("line_items[0][price]", price);
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[user_id]", input.userId);
  body.set("metadata[plan_id]", quote.plan.id);
  body.set("subscription_data[metadata][user_id]", input.userId);
  body.set("subscription_data[metadata][plan_id]", quote.plan.id);
  body.set("integration_identifier", `recatch_plans_${randomSuffix()}`);
  // Dynamic payment methods (no payment_method_types): required on 2026-09-30.endive, and what
  // Adaptive Pricing uses to show a local currency while the Price stays USD.
  body.set("billing_address_collection", "required");
  body.set("tax_id_collection[enabled]", "true");
  body.set("locale", "auto");
  // Checkout is always created for an existing Customer, so it can save the address and legal name.
  body.set("customer_update[address]", "auto");
  body.set("customer_update[name]", "auto");
  if (automaticTaxEnabled()) body.set("automatic_tax[enabled]", "true");
  if (quote.promoApplied) {
    const coupon = await ensureCoupon(quote.percentOff);
    body.set("discounts[0][coupon]", coupon);
  }
  const session = await stripeRequest("POST", "/checkout/sessions", body);
  const url = typeof session.url === "string" ? session.url : "";
  if (!isStripeHost(url, "checkout.stripe.com")) throw new BillingError("Payment service did not return a checkout page", 502);
  return url;
}

export async function startPortal(customerId: string): Promise<string> {
  if (!paymentsConfigured()) throw new BillingError("Checkout isn't available yet", 503);
  const origin = publicUrl();
  if (!origin) throw new BillingError("Checkout isn't available yet", 503);
  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("return_url", `${origin}/billing`);
  const session = await stripeRequest("POST", "/billing_portal/sessions", body);
  const url = typeof session.url === "string" ? session.url : "";
  if (!isStripeHost(url, "billing.stripe.com")) throw new BillingError("Payment service did not return a billing page", 502);
  return url;
}

function asObject(value: unknown): StripeObject | null {
  return value && typeof value === "object" ? (value as StripeObject) : null;
}

/** Confirm a Checkout session with Stripe itself. The browser's return visit is not trusted on its own. */
export async function confirmCheckoutSession(userId: string, sessionId: string): Promise<{ access: boolean; message: string }> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { access: false, message: "That checkout session is not valid." };
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return { access: false, message: "Checkout isn't available yet." };
  const session = await stripeRequest("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`);
  const customerId = stripeId(session.customer);
  const reference = typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  const meta = asObject(session.metadata);
  const metaUser = typeof meta?.user_id === "string" ? meta.user_id : null;
  if (reference !== userId && metaUser !== userId) return { access: false, message: "This checkout belongs to a different account." };
  if (session.payment_status === "unpaid") {
    return { access: false, message: "The payment hasn't cleared yet. If you just paid, wait a moment and refresh this page." };
  }
  if (session.payment_status !== "paid") {
    return { access: false, message: "The payment hasn't finished." };
  }
  const subscription = asObject(session.subscription);
  const subscriptionId = stripeId(session.subscription);
  const stripeStatus = typeof subscription?.status === "string" ? subscription.status : "active";
  const planFromSub = typeof asObject(subscription?.metadata)?.plan_id === "string" ? String(asObject(subscription?.metadata)?.plan_id) : null;
  const planId = (typeof meta?.plan_id === "string" ? meta.plan_id : null) ?? planFromSub;
  const billingStatus = billingStatusFromStripe(stripeStatus);
  // A paid Checkout with no expanded status is the first invoice succeeding. Anything else must be active.
  const next = subscription && stripeStatus !== "active" ? billingStatus : "active";
  const saved = await saveBilling({
    userId,
    billingStatus: next,
    planId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
  if (saved.access) {
    const amount = session.amount_total;
    await recordBillingPayment({
      userId,
      invoiceId: stripeId(session.invoice),
      checkoutSessionId: sessionId,
      subscriptionId,
      amountCents: typeof amount === "number" && Number.isInteger(amount) && amount >= 0 ? amount : null,
      currency: typeof session.currency === "string" ? session.currency.toLowerCase().slice(0, 12) : null,
      billingReason: "subscription_create",
    }).catch((error) => log.warn("Could not record the checkout payment", error instanceof Error ? error.message : error));
  }
  return saved.access
    ? { access: true, message: "Payment confirmed." }
    : { access: false, message: "The payment hasn't finished opening the workspace yet." };
}
