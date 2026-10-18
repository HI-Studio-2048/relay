import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const realFetch = globalThis.fetch;

function sign(raw: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function stripeJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

describe("signup and billing", () => {
  beforeAll(() => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-billing-")));
    vi.stubEnv("BILLING_PROMO_ENABLED", "true");
    vi.stubEnv("BILLING_PROMO_PERCENT_OFF", "50");
    vi.stubEnv("BILLING_PROMO_PLAN_IDS", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function billingOf(email: string) {
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const db = await getDb();
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  it("rejects a bad email and creates an account with no workspace access when checkout is not configured", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const post = (body: unknown) =>
      POST(new Request("https://recatch.test/api/auth/signup", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" } }));
    const invalid = await post({ email: "not-an-email", password: "longpassword", planId: "pro" });
    expect(invalid.status).toBe(400);
    const created = await post({ name: "Ada", email: "Ada@Example.test", password: "longpassword", planId: "pro" });
    expect(created.status).toBe(200);
    const payload = await created.json();
    expect(payload.checkoutUrl).toBeNull();
    expect(payload.next).toBe("/billing");
    expect(created.headers.get("set-cookie")).toContain("relay_session");
    const row = await billingOf("ada@example.test");
    expect(row?.billingStatus).toBe("none");
    expect(row?.planId).toBe("pro");
    expect(row?.stripeCustomerId).toBeNull();
  });

  it("ignores an unpaid Checkout and opens the workspace only after a paid one", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const { POST } = await import("@/app/api/billing/webhook/route");
    const row = await billingOf("ada@example.test");
    const deliver = (payload: unknown, signature?: string) => {
      const raw = JSON.stringify(payload);
      return POST(
        new Request("https://recatch.test/api/billing/webhook", {
          method: "POST",
          body: raw,
          headers: { "stripe-signature": signature ?? sign(raw, "whsec_test") },
        }),
      );
    };
    const unpaid = await deliver({
      id: "evt_unpaid",
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", payment_status: "unpaid", customer: "cus_ada", client_reference_id: row!.id, metadata: { user_id: row!.id, plan_id: "pro" } } },
    });
    expect(unpaid.status).toBe(200);
    expect((await billingOf("ada@example.test"))?.billingStatus).toBe("none");

    const bad = await deliver({ id: "evt_bad", type: "checkout.session.completed", data: { object: {} } }, "t=1,v1=nope");
    expect(bad.status).toBe(400);

    const paid = await deliver({
      id: "evt_paid",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          payment_status: "paid",
          customer: "cus_ada",
          subscription: "sub_ada",
          client_reference_id: row!.id,
          metadata: { user_id: row!.id, plan_id: "pro" },
        },
      },
    });
    expect(paid.status).toBe(200);
    expect((await billingOf("ada@example.test"))?.billingStatus).toBe("active");
    expect((await billingOf("ada@example.test"))?.stripeCustomerId).toBe("cus_ada");

    const failed = await deliver({
      id: "evt_failed",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_ada", subscription: "sub_ada" } },
    });
    expect(failed.status).toBe(200);
    expect((await billingOf("ada@example.test"))?.billingStatus).toBe("past_due");

    const renewed = await deliver({
      id: "evt_renewed",
      type: "invoice.paid",
      data: { object: { customer: "cus_ada", subscription: "sub_ada", status: "paid", paid: true } },
    });
    expect(renewed.status).toBe(200);
    expect((await billingOf("ada@example.test"))?.billingStatus).toBe("active");
  });

  it("holds access on a dispute resolved through the Stripe charge", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/charges/ch_ada")) return stripeJson({ id: "ch_ada", customer: "cus_ada" });
        return realFetch(input);
      }),
    );
    const { POST } = await import("@/app/api/billing/webhook/route");
    const raw = JSON.stringify({ id: "evt_dispute", type: "charge.dispute.created", data: { object: { charge: "ch_ada" } } });
    const response = await POST(
      new Request("https://recatch.test/api/billing/webhook", {
        method: "POST",
        body: raw,
        headers: { "stripe-signature": sign(raw, "whsec_test") },
      }),
    );
    expect(response.status).toBe(200);
    expect((await billingOf("ada@example.test"))?.billingStatus).toBe("past_due");
  });

  it("starts Stripe Checkout for a new account and applies the first-month coupon", async () => {
    const seen: string[] = [];
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("api.stripe.com")) return realFetch(input, init);
        const method = init?.method ?? "GET";
        const body = init?.body ? String(init.body) : "";
        seen.push(`${method} ${url} ${body}`);
        if (method === "POST" && url.endsWith("/v1/customers")) return stripeJson({ id: "cus_new" });
        if (method === "GET" && url.includes("/v1/prices")) return stripeJson({ data: [] });
        if (method === "GET" && url.includes("/v1/products/search")) return stripeJson({ data: [{ id: "prod_pro" }] });
        if (method === "GET" && url.includes("/v1/coupons/")) return stripeJson({ error: { message: "No such coupon" } }, 404);
        if (method === "POST" && url.endsWith("/v1/coupons")) return stripeJson({ id: "recatch_launch_50_once" });
        if (method === "POST" && url.endsWith("/v1/prices")) return stripeJson({ id: "price_pro" });
        if (method === "POST" && url.endsWith("/v1/checkout/sessions")) {
          expect(body).toContain("mode=subscription");
          expect(body).not.toContain("payment_method_types");
          expect(body).not.toContain("trial_period");
          expect(body).toContain("{CHECKOUT_SESSION_ID}");
          expect(body).toContain("recatch_launch_50_once");
          return stripeJson({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" });
        }
        return stripeJson({ error: { message: `unexpected ${method} ${url}` } }, 500);
      }),
    );
    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new Request("https://recatch.test/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name: "Bea", email: "bea@example.test", password: "longpassword", planId: "pro" }),
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20" },
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    const row = await billingOf("bea@example.test");
    expect(row?.billingStatus).toBe("none");
    expect(row?.stripeCustomerId).toBe("cus_new");
    expect(seen.some((line) => line.includes("duration=once"))).toBe(true);
    expect(seen.some((line) => line.includes("percent_off=50"))).toBe(true);
  });
});
