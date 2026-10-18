import { describe, expect, it, vi } from "vitest";
import { billingStatusFromStripe, hasWorkspaceAccess } from "@/lib/billing/access";
import { billingConfig } from "@/lib/billing/config";
import { formatMoney, listQuotes, promoApplies, quotePlan } from "@/lib/billing/quote";
import { encodeStripeForm } from "@/lib/billing/stripe-api";
import { allowAttempt } from "@/lib/rate-limit";

describe("plan quotes", () => {
  it("prices the launch promo at half of every plan for the first month", () => {
    vi.stubEnv("BILLING_PROMO_ENABLED", "");
    vi.stubEnv("BILLING_PROMO_PERCENT_OFF", "");
    vi.stubEnv("BILLING_PROMO_PLAN_IDS", "");
    const quotes = listQuotes();
    expect(quotes.map((quote) => quote.plan.id)).toEqual(["starter", "pro", "business"]);
    expect(quotes.every((quote) => quote.promoApplied && quote.firstPeriodLabel === "first month")).toBe(true);
    expect(quotes.map((quote) => [quote.regularCents, quote.dueTodayCents, quote.renewalCents])).toEqual([
      [4900, 2450, 4900],
      [9900, 4950, 9900],
      [19900, 9950, 19900],
    ]);
    expect(formatMoney(2450)).toBe("$24.50");
    expect(formatMoney(4900)).toBe("$49");
    vi.unstubAllEnvs();
  });

  it("turns the promo off, or limits it to named plans, from the environment", () => {
    vi.stubEnv("BILLING_PROMO_ENABLED", "false");
    expect(listQuotes().every((quote) => !quote.promoApplied && quote.dueTodayCents === quote.regularCents)).toBe(true);
    vi.stubEnv("BILLING_PROMO_ENABLED", "true");
    vi.stubEnv("BILLING_PROMO_PLAN_IDS", "pro");
    vi.stubEnv("BILLING_PROMO_PERCENT_OFF", "25");
    const pro = quotePlan("pro")!;
    const starter = quotePlan("starter")!;
    expect(pro.promoApplied).toBe(true);
    expect(pro.dueTodayCents).toBe(7425);
    expect(starter.promoApplied).toBe(false);
    expect(promoApplies("business", billingConfig().promo)).toBe(false);
    expect(quotePlan("nope")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("ignores a promo percent or a price that would make a plan free", () => {
    vi.stubEnv("BILLING_PROMO_PERCENT_OFF", "100");
    vi.stubEnv("BILLING_PRICE_STARTER_CENTS", "0");
    const starter = quotePlan("starter")!;
    expect(starter.percentOff).toBe(50);
    expect(starter.regularCents).toBe(4900);
    vi.unstubAllEnvs();
  });
});

describe("workspace access", () => {
  it("opens only an active subscription", () => {
    expect(hasWorkspaceAccess("active")).toBe(true);
    expect(hasWorkspaceAccess("none")).toBe(false);
    expect(hasWorkspaceAccess("past_due")).toBe(false);
    expect(hasWorkspaceAccess("canceled")).toBe(false);
    expect(hasWorkspaceAccess(null)).toBe(false);
    expect(billingStatusFromStripe("active")).toBe("active");
    expect(billingStatusFromStripe("trialing")).toBe("none");
    expect(billingStatusFromStripe("past_due")).toBe("past_due");
    expect(billingStatusFromStripe("canceled")).toBe("canceled");
  });
});

describe("Stripe form encoding", () => {
  it("keeps the Checkout session placeholder literal", () => {
    const body = new URLSearchParams();
    body.set("success_url", "https://recatch.test/billing/return?session_id={CHECKOUT_SESSION_ID}");
    const encoded = encodeStripeForm(body);
    expect(encoded).toContain("{CHECKOUT_SESSION_ID}");
    expect(encoded).not.toContain("%7BCHECKOUT_SESSION_ID%7D");
  });
});

describe("signup rate limit", () => {
  it("stops after the window's allowance", async () => {
    for (let i = 0; i < 5; i += 1) expect(await allowAttempt("signup:billing-test", 5, 60)).toBe(true);
    expect(await allowAttempt("signup:billing-test", 5, 60)).toBe(false);
  });
});
