import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readStripe, stripeAmount, verifyStripeSignature } from "@/lib/stripe";

const secret = "whsec_test";
const sign = (body: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("Stripe webhooks", () => {
  it("accepts a fresh, correctly signed payload only", () => {
    const body = '{"type":"checkout.session.completed"}';
    const now = 1_790_000_000_000;
    const t = now / 1000;
    expect(verifyStripeSignature(body, sign(body, t), secret, now)).toBe(true);
    expect(verifyStripeSignature(body + " ", sign(body, t), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, t - 600), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=deadbeef`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
  });

  it("defaults the goal and tag", () => {
    expect(readStripe(null)).toEqual({ webhookSecretEncrypted: null, goalName: "Purchase", tag: "customer" });
  });
});

describe("stripeAmount", () => {
  it("respects each currency's decimals", () => {
    expect(stripeAmount(1999, "usd")).toBe(19.99);
    expect(stripeAmount(1500, "JPY")).toBe(1500);
    expect(stripeAmount(12345, "kwd")).toBe(12.345);
  });
});
