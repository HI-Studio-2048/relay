import { redactSecrets } from "@/lib/crypto";
import { BillingError } from "@/lib/billing/errors";

/** Pinned so Checkout and coupons behave the same on every deploy. */
const STRIPE_VERSION = "2026-09-30.endive";

export function stripeSecret(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || null;
}

export type StripeObject = Record<string, unknown>;

/** Stripe's `{CHECKOUT_SESSION_ID}` placeholder must survive form encoding. */
export function encodeStripeForm(body: URLSearchParams): string {
  return body.toString().replaceAll("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
}

function stripeMessage(data: unknown): string {
  const message = (data as { error?: { message?: unknown } } | null)?.error?.message;
  const text = typeof message === "string" && message.trim() ? message.trim() : "Payment service refused the request";
  return redactSecrets(text).slice(0, 300);
}

/**
 * One Stripe call. `success_url` may contain the literal `{CHECKOUT_SESSION_ID}` placeholder,
 * which Stripe requires unencoded.
 */
export async function stripeRequest(method: "GET" | "POST", path: string, body?: URLSearchParams, idempotencyKey?: string): Promise<StripeObject> {
  const key = stripeSecret();
  if (!key) throw new BillingError("Checkout isn't available yet", 503);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_VERSION,
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let encoded: string | undefined;
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    encoded = encodeStripeForm(body);
  }
  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : encoded,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network";
    throw new BillingError(`Could not reach the payment service (${redactSecrets(detail).slice(0, 120)})`, 502);
  }
  const data = (await response.json().catch(() => ({}))) as StripeObject;
  if (response.status === 404) throw new BillingError(stripeMessage(data), 404);
  if (!response.ok) throw new BillingError(stripeMessage(data), 502);
  return data;
}

export async function stripeGetOptional(path: string): Promise<StripeObject | null> {
  try {
    return await stripeRequest("GET", path);
  } catch (error) {
    if (error instanceof BillingError && error.status === 404) return null;
    throw error;
  }
}

export function stripeId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

export function isStripeHost(url: string, host: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === host;
  } catch {
    return false;
  }
}
