import { stripeId, type StripeObject } from "@/lib/billing/stripe-api";

function asObject(value: unknown): StripeObject | null {
  return value && typeof value === "object" ? (value as StripeObject) : null;
}

/**
 * Subscription that generated this invoice.
 *
 * API version 2026-09-30.endive (every version since 2025-03-31.basil) removed
 * `invoice.subscription`. The id lives on `parent.subscription_details.subscription`
 * when `parent.type` is `subscription_details`. The top-level field is only a
 * fallback for an older webhook endpoint.
 */
export function invoiceSubscriptionId(invoice: StripeObject): string | null {
  const parent = asObject(invoice.parent);
  if (parent?.type === "subscription_details") {
    const id = stripeId(asObject(parent.subscription_details)?.subscription);
    if (id) return id;
  }
  return stripeId(invoice.subscription);
}

/** Snapshot of the subscription metadata stored on the invoice parent. */
export function invoiceSubscriptionMetadata(invoice: StripeObject): StripeObject {
  const parent = asObject(invoice.parent);
  if (parent?.type !== "subscription_details") return {};
  const meta = asObject(parent.subscription_details)?.metadata;
  return meta && typeof meta === "object" ? (meta as StripeObject) : {};
}

/**
 * Whether this invoice has been paid.
 *
 * `status` is the current field (`draft | open | paid | uncollectible | void`).
 * `status_transitions.paid_at` is set when it becomes paid. The boolean `paid`
 * was removed in 2025-03-31.basil; it is consulted only when `status` is absent.
 */
export function invoiceIsPaid(invoice: StripeObject): boolean {
  if (typeof invoice.status === "string") return invoice.status === "paid";
  const paidAt = asObject(invoice.status_transitions)?.paid_at;
  if (typeof paidAt === "number") return paidAt > 0;
  return invoice.paid === true;
}
