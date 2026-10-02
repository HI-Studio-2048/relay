import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

/**
 * Stripe webhook signatures: header `t=<unix>,v1=<hex>`; v1 = HMAC-SHA256(secret, `${t}.${rawBody}`).
 * Rejects stale timestamps (replays) beyond `toleranceSeconds`.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now(), toleranceSeconds = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key!.trim(), rest.join("=")];
    }),
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const signatures = header
    .split(",")
    .filter((part) => part.trim().startsWith("v1="))
    .map((part) => part.trim().slice(3));
  return signatures.some((signature) => safeEqual(signature, expected));
}

export type StripeSettings = { webhookSecretEncrypted: string | null; goalName: string; tag: string };

export function readStripe(settings: Record<string, unknown> | null | undefined): StripeSettings {
  const raw = (settings?.stripe ?? {}) as Partial<StripeSettings>;
  return {
    webhookSecretEncrypted: typeof raw.webhookSecretEncrypted === "string" ? raw.webhookSecretEncrypted : null,
    goalName: typeof raw.goalName === "string" && raw.goalName.trim() ? raw.goalName.trim().slice(0, 80) : "Purchase",
    tag: typeof raw.tag === "string" ? raw.tag.trim().slice(0, 60) : "customer",
  };
}

/** Stripe amounts are in the currency's minor unit; most have 2 decimals, these have 0 or 3. */
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function stripeAmount(minor: number, currency: string | undefined) {
  const code = (currency ?? "").toLowerCase();
  const exponent = ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMAL.has(code) ? 3 : 2;
  return minor / 10 ** exponent;
}
