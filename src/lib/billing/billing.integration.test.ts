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

  // Start the database here, not inside the first test: a busy full run timed it out there.
  beforeAll(async () => {
    const { getDb } = await import("@/lib/db");
    await getDb();
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

  it("applies current-version invoice events once, and opens the workspace only after a paid Checkout", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { POST: signup } = await import("@/app/api/auth/signup/route");
    const created = await signup(
      new Request("https://recatch.test/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name: "Cara", email: "cara@example.test", password: "longpassword", planId: "pro" }),
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.30" },
      }),
    );
    expect(created.status).toBe(200);
    const row = await billingOf("cara@example.test");
    const { POST } = await import("@/app/api/billing/webhook/route");
    const deliver = (payload: unknown) => {
      const raw = JSON.stringify(payload);
      return POST(
        new Request("https://recatch.test/api/billing/webhook", {
          method: "POST",
          body: raw,
          headers: { "stripe-signature": sign(raw, "whsec_test") },
        }),
      );
    };
    const session = (paymentStatus: string, extra: Record<string, unknown> = {}) =>
      deliver({
        id: `evt_${paymentStatus}`,
        type: extra.type ?? "checkout.session.completed",
        data: {
          object: {
            id: "cs_cara",
            object: "checkout.session",
            mode: "subscription",
            payment_status: paymentStatus,
            customer: "cus_cara",
            client_reference_id: row!.id,
            metadata: { user_id: row!.id, plan_id: "pro" },
            ...extra,
          },
        },
      });

    expect((await session("no_payment_required")).status).toBe(200);
    expect((await session("unpaid")).status).toBe(200);
    expect((await billingOf("cara@example.test"))?.billingStatus).toBe("none");

    const failedAsync = await session("unpaid", { type: "checkout.session.async_payment_failed", id: "cs_cara_async" });
    expect(failedAsync.status).toBe(200);
    expect((await billingOf("cara@example.test"))?.billingStatus).toBe("unpaid");

    // Charged amount is a presentment currency, not the USD plan price. The plan stays on metadata.
    const paidAsync = await deliver({
      id: "evt_async_paid",
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          id: "cs_cara_paid",
          object: "checkout.session",
          mode: "subscription",
          payment_status: "paid",
          customer: "cus_cara",
          invoice: "in_cara_first",
          subscription: "sub_cara",
          amount_total: 5300,
          currency: "eur",
          client_reference_id: row!.id,
          metadata: { user_id: row!.id, plan_id: "pro" },
        },
      },
    });
    expect(paidAsync.status).toBe(200);
    expect((await billingOf("cara@example.test"))?.billingStatus).toBe("active");
    expect((await billingOf("cara@example.test"))?.planId).toBe("pro");

    const firstInvoice = {
      id: "in_cara_first",
      object: "invoice",
      customer: "cus_cara",
      status: "paid",
      billing_reason: "subscription_create",
      amount_paid: 5300,
      currency: "eur",
      status_transitions: { finalized_at: 1710000000, paid_at: 1710000010, marked_uncollectible_at: null, voided_at: null },
      parent: {
        type: "subscription_details",
        quote_details: null,
        subscription_details: { subscription: "sub_cara", metadata: { user_id: row!.id, plan_id: "pro" } },
      },
      payments: {
        object: "list",
        data: [{ id: "inpay_cara_first", object: "invoice_payment", amount_paid: 5300, currency: "eur", status: "paid", payment: { type: "payment_intent", payment_intent: "pi_cara_first" } }],
      },
    };
    expect((await deliver({ id: "evt_in_first", type: "invoice.paid", data: { object: firstInvoice } })).status).toBe(200);
    expect((await deliver({ id: "evt_in_first_retry", type: "invoice.paid", data: { object: firstInvoice } })).status).toBe(200);

    const renewal = {
      id: "in_cara_renewal",
      object: "invoice",
      customer: "cus_cara",
      status: "paid",
      billing_reason: "subscription_cycle",
      amount_paid: 9900,
      currency: "usd",
      status_transitions: { finalized_at: 1720000000, paid_at: 1720000010, marked_uncollectible_at: null, voided_at: null },
      parent: {
        type: "subscription_details",
        quote_details: null,
        subscription_details: { subscription: "sub_cara", metadata: { user_id: row!.id, plan_id: "pro" } },
      },
    };
    expect((await deliver({ id: "evt_in_renewal", type: "invoice.paid", data: { object: renewal } })).status).toBe(200);
    expect((await billingOf("cara@example.test"))?.billingStatus).toBe("active");
    expect((await billingOf("cara@example.test"))?.stripeSubscriptionId).toBe("sub_cara");

    const failedRenewal = {
      id: "in_cara_failed",
      object: "invoice",
      customer: "cus_cara",
      status: "open",
      billing_reason: "subscription_cycle",
      amount_due: 9900,
      amount_paid: 0,
      currency: "usd",
      parent: {
        type: "subscription_details",
        quote_details: null,
        subscription_details: { subscription: "sub_cara", metadata: { user_id: row!.id, plan_id: "pro" } },
      },
      payments: {
        object: "list",
        data: [{ id: "inpay_cara_failed", object: "invoice_payment", status: "open", payment: { type: "payment_intent", payment_intent: "pi_cara_failed" } }],
      },
    };
    expect((await deliver({ id: "evt_in_failed", type: "invoice.payment_failed", data: { object: failedRenewal } })).status).toBe(200);
    expect((await billingOf("cara@example.test"))?.billingStatus).toBe("past_due");

    expect((await deliver({ id: "evt_in_renewal_replay", type: "invoice.paid", data: { object: renewal } })).status).toBe(200);
    expect((await billingOf("cara@example.test"))?.billingStatus).toBe("active");
    expect((await billingOf("cara@example.test"))?.planId).toBe("pro");

    const { getDb } = await import("@/lib/db");
    const { billingPayments } = await import("@/lib/db/schema");
    const db = await getDb();
    const payments = await db.select().from(billingPayments).where(eq(billingPayments.userId, row!.id));
    expect(payments.map((payment) => payment.invoiceId).sort()).toEqual(["in_cara_first", "in_cara_renewal"]);
    const first = payments.find((payment) => payment.invoiceId === "in_cara_first");
    expect(first?.billingReason).toBe("subscription_create");
    expect(first?.checkoutSessionId).toBe("cs_cara_paid");
    expect(first?.amountCents).toBe(5300);
    expect(first?.currency).toBe("eur");
    expect(payments.find((payment) => payment.invoiceId === "in_cara_renewal")?.billingReason).toBe("subscription_cycle");

    const erinCreated = await signup(
      new Request("https://recatch.test/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name: "Erin", email: "erin@example.test", password: "longpassword", planId: "starter" }),
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.31" },
      }),
    );
    expect(erinCreated.status).toBe(200);
    const erin = await billingOf("erin@example.test");
    const erinInvoice = {
      id: "in_erin_first",
      object: "invoice",
      customer: "cus_erin",
      status: "paid",
      billing_reason: "subscription_create",
      amount_paid: 2450,
      currency: "usd",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_erin", metadata: { user_id: erin!.id, plan_id: "starter" } } },
    };
    expect((await deliver({ id: "evt_erin_invoice", type: "invoice.paid", data: { object: erinInvoice } })).status).toBe(200);
    expect((await deliver({
      id: "evt_erin_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_erin",
          mode: "subscription",
          payment_status: "paid",
          customer: "cus_erin",
          invoice: "in_erin_first",
          subscription: "sub_erin",
          amount_total: 2450,
          currency: "usd",
          client_reference_id: erin!.id,
          metadata: { user_id: erin!.id, plan_id: "starter" },
        },
      },
    })).status).toBe(200);
    const erinPayments = await db.select().from(billingPayments).where(eq(billingPayments.userId, erin!.id));
    expect(erinPayments).toHaveLength(1);
    expect(erinPayments[0]?.invoiceId).toBe("in_erin_first");
    expect(erinPayments[0]?.checkoutSessionId).toBe("cs_erin");
    expect((await billingOf("erin@example.test"))?.billingStatus).toBe("active");
    expect((await billingOf("erin@example.test"))?.planId).toBe("starter");
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
    expect((await billingOf("ada@example.test"))?.billingStatus).toBe("unpaid");
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
        if (method === "POST" && url.endsWith("/v1/prices")) {
          expect(decodeURIComponent(body)).toContain("lookup_key=recatch_pro_month_9900");
          return stripeJson({ id: "price_pro" });
        }
        if (method === "POST" && url.endsWith("/v1/checkout/sessions")) {
          const decoded = decodeURIComponent(body);
          expect(decoded).toContain("mode=subscription");
          expect(decoded).not.toContain("payment_method_types");
          expect(decoded).not.toContain("trial_period");
          expect(decoded).toContain("{CHECKOUT_SESSION_ID}");
          expect(decoded).toContain("recatch_launch_50_once");
          expect(decoded).toContain("billing_address_collection=required");
          expect(decoded).toContain("tax_id_collection[enabled]=true");
          expect(decoded).toContain("customer_update[address]=auto");
          expect(decoded).toContain("customer_update[name]=auto");
          expect(decoded).toContain("locale=auto");
          expect(decoded).not.toContain("automatic_tax");
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

  it("reuses the launch coupon and enables automatic tax only when the flag is on", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "true");
    const posts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("api.stripe.com")) return realFetch(input, init);
        const method = init?.method ?? "GET";
        const body = init?.body ? String(init.body) : "";
        if (method === "POST") posts.push(url);
        if (method === "GET" && url.includes("/v1/subscriptions?")) return stripeJson({ data: [{ id: "sub_old", status: "canceled" }] });
        if (method === "GET" && url.includes("/v1/checkout/sessions?")) return stripeJson({ data: [{ id: "cs_earlier" }] });
        if (method === "POST" && url.endsWith("/v1/checkout/sessions/cs_earlier/expire")) return stripeJson({ id: "cs_earlier", status: "expired" });
        if (method === "GET" && url.includes("/v1/prices")) return stripeJson({ data: [{ id: "price_pro" }] });
        if (method === "GET" && url.includes("/v1/products/search")) return stripeJson({ data: [{ id: "prod_pro" }] });
        if (method === "POST" && url.endsWith("/v1/prices")) return stripeJson({ id: "price_pro" });
        if (method === "GET" && url.includes("/v1/coupons/recatch_launch_50_once")) {
          return stripeJson({ id: "recatch_launch_50_once", percent_off: 50, duration: "once", valid: true });
        }
        if (method === "POST" && url.endsWith("/v1/coupons")) return stripeJson({ error: { message: "should reuse the coupon" } }, 500);
        if (method === "POST" && url.endsWith("/v1/checkout/sessions")) {
          const decoded = decodeURIComponent(body);
          expect(decoded).toContain("discounts[0][coupon]=recatch_launch_50_once");
          expect(decoded).toContain("automatic_tax[enabled]=true");
          expect(decoded).not.toContain("payment_method_types");
          return stripeJson({ id: "cs_test_456", url: "https://checkout.stripe.com/c/pay/cs_test_456" });
        }
        return stripeJson({ error: { message: `unexpected ${method} ${url}` } }, 500);
      }),
    );
    const row = await billingOf("bea@example.test");
    const { startCheckout } = await import("@/lib/billing/checkout");
    const url = await startCheckout({
      userId: row!.id,
      email: row!.email,
      name: row!.name,
      planId: "pro",
      customerId: row!.stripeCustomerId,
    });
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_456");
    expect(posts.some((url) => url.endsWith("/v1/coupons"))).toBe(false);
    // The checkout left open in another tab is expired, so only the new one can be paid.
    expect(posts.some((url) => url.endsWith("/v1/checkout/sessions/cs_earlier/expire"))).toBe(true);
  });

  it("refuses a second checkout while a subscription is live", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const posts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("api.stripe.com")) return realFetch(input, init);
        const method = init?.method ?? "GET";
        if (method === "POST") posts.push(url);
        if (method === "GET" && url.includes("/v1/subscriptions?")) return stripeJson({ data: [{ id: "sub_live", status: "active" }] });
        return stripeJson({ error: { message: `unexpected ${method} ${url}` } }, 500);
      }),
    );
    const row = await billingOf("bea@example.test");
    const { startCheckout } = await import("@/lib/billing/checkout");
    await expect(
      startCheckout({ userId: row!.id, email: row!.email, name: row!.name, planId: "pro", customerId: row!.stripeCustomerId }),
    ).rejects.toThrow("already has a plan");
    expect(posts).toEqual([]);
  });

  it("ignores late and foreign subscription events, keeps a failed renewal open, and pauses on unpaid", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { POST: signup } = await import("@/app/api/auth/signup/route");
    await signup(
      new Request("https://recatch.test/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name: "Finn", email: "finn@example.test", password: "longpassword", planId: "pro" }),
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.40" },
      }),
    );
    const finn = await billingOf("finn@example.test");
    const { POST } = await import("@/app/api/billing/webhook/route");
    let n = 0;
    const deliver = (type: string, object: Record<string, unknown>) => {
      const raw = JSON.stringify({ id: `evt_finn_${++n}`, type, data: { object } });
      return POST(new Request("https://recatch.test/api/billing/webhook", { method: "POST", body: raw, headers: { "stripe-signature": sign(raw, "whsec_test") } }));
    };
    const meta = { user_id: finn!.id, plan_id: "pro" };
    const invoiceParent = { type: "subscription_details", subscription_details: { subscription: "sub_finn", metadata: meta } };

    await deliver("checkout.session.completed", { id: "cs_finn", mode: "subscription", payment_status: "paid", customer: "cus_finn", subscription: "sub_finn", client_reference_id: finn!.id, metadata: meta });
    expect((await billingOf("finn@example.test"))?.billingStatus).toBe("active");

    // subscription.created can arrive after the paid Checkout, still saying `incomplete`.
    await deliver("customer.subscription.created", { id: "sub_finn", status: "incomplete", customer: "cus_finn", metadata: meta });
    expect((await billingOf("finn@example.test"))?.billingStatus).toBe("active");

    // A duplicate subscription being cancelled must not close the one that is paid for.
    await deliver("customer.subscription.deleted", { id: "sub_finn_dup", status: "canceled", customer: "cus_finn", metadata: meta });
    expect((await billingOf("finn@example.test"))?.billingStatus).toBe("active");
    expect((await billingOf("finn@example.test"))?.stripeSubscriptionId).toBe("sub_finn");

    // A failed renewal keeps the workspace open while Stripe retries.
    await deliver("invoice.payment_failed", { id: "in_finn_fail", customer: "cus_finn", status: "open", parent: invoiceParent });
    expect((await billingOf("finn@example.test"))?.billingStatus).toBe("past_due");
    const { workspaceGate } = await import("@/lib/billing/gate");
    expect(await workspaceGate(finn!.id)).toBe("ok");

    // Give Finn a channel account so the pause can be seen on it.
    const { getDb } = await import("@/lib/db");
    const { bots } = await import("@/lib/db/schema");
    const db = await getDb();
    const botId = "bot_finn";
    await db.insert(bots).values({ id: botId, ownerId: finn!.id, channel: "telegram", name: "Finn", tokenEncrypted: "x", webhookSecret: "finn-secret" } as typeof bots.$inferInsert);
    const { botBillingPaused, forgetBillingPauses, BillingPausedError } = await import("@/lib/billing/paused");
    forgetBillingPauses();
    expect(await botBillingPaused(botId)).toBe(false);

    // Stripe gives up: workspace closed and automations paused.
    await deliver("customer.subscription.updated", { id: "sub_finn", status: "unpaid", customer: "cus_finn", metadata: meta });
    expect((await billingOf("finn@example.test"))?.billingStatus).toBe("unpaid");
    expect(await workspaceGate(finn!.id)).toBe("unpaid");
    expect(await botBillingPaused(botId)).toBe(true);
    const { sendChannelReply } = await import("@/lib/channels");
    await expect(sendChannelReply({ id: botId, channel: "telegram", token: "x" } as never, "123", { text: "hi" } as never)).rejects.toBeInstanceOf(BillingPausedError);

    // Paying again switches everything back on straight away.
    await deliver("invoice.paid", { id: "in_finn_paid", customer: "cus_finn", status: "paid", amount_paid: 9900, currency: "usd", billing_reason: "subscription_cycle", parent: invoiceParent });
    expect((await billingOf("finn@example.test"))?.billingStatus).toBe("active");
    expect(await botBillingPaused(botId)).toBe(false);
  });

  it("keeps the return page closed until Stripe reports the session paid", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "");
    const { POST: signup } = await import("@/app/api/auth/signup/route");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("api.stripe.com")) return realFetch(input, init);
        return stripeJson({ error: { message: "signup should not call stripe" } }, 500);
      }),
    );
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const created = await signup(
      new Request("https://recatch.test/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name: "Dora", email: "dora@example.test", password: "longpassword", planId: "pro" }),
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.40" },
      }),
    );
    expect(created.status).toBe(200);
    const row = await billingOf("dora@example.test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("api.stripe.com")) return realFetch(input, init);
        if (url.includes("/checkout/sessions/cs_unpaid")) {
          return stripeJson({ id: "cs_unpaid", payment_status: "unpaid", mode: "subscription", client_reference_id: row!.id, metadata: { user_id: row!.id, plan_id: "pro" }, customer: "cus_dora" });
        }
        if (url.includes("/checkout/sessions/cs_free")) {
          return stripeJson({ id: "cs_free", payment_status: "no_payment_required", mode: "subscription", client_reference_id: row!.id, metadata: { user_id: row!.id, plan_id: "pro" }, customer: "cus_dora" });
        }
        if (url.includes("/checkout/sessions/cs_paidDora")) {
          return stripeJson({
            id: "cs_paidDora",
            payment_status: "paid",
            mode: "subscription",
            client_reference_id: row!.id,
            customer: "cus_dora",
            invoice: "in_dora",
            amount_total: 12345,
            currency: "jpy",
            metadata: { user_id: row!.id, plan_id: "pro" },
            subscription: { id: "sub_dora", status: "active", metadata: { plan_id: "pro" } },
          });
        }
        return stripeJson({ error: { message: `unexpected ${url}` } }, 500);
      }),
    );
    const { confirmCheckoutSession } = await import("@/lib/billing/checkout");
    expect((await confirmCheckoutSession(row!.id, "cs_unpaid")).access).toBe(false);
    expect((await confirmCheckoutSession(row!.id, "cs_free")).access).toBe(false);
    expect((await billingOf("dora@example.test"))?.billingStatus).toBe("none");
    expect((await confirmCheckoutSession(row!.id, "cs_paidDora")).access).toBe(true);
    expect((await confirmCheckoutSession(row!.id, "cs_paidDora")).access).toBe(true);
    const saved = await billingOf("dora@example.test");
    expect(saved?.billingStatus).toBe("active");
    expect(saved?.planId).toBe("pro");
    const { getDb } = await import("@/lib/db");
    const { billingPayments } = await import("@/lib/db/schema");
    const db = await getDb();
    const payments = await db.select().from(billingPayments).where(eq(billingPayments.userId, row!.id));
    expect(payments).toHaveLength(1);
    expect(payments[0]?.invoiceId).toBe("in_dora");
    expect(payments[0]?.amountCents).toBe(12345);
    expect(payments[0]?.currency).toBe("jpy");
  });
});
