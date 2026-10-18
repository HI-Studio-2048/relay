import { createUser, normalizeEmail } from "@/lib/auth";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";
import { loadAccountBilling } from "@/lib/billing/account";
import { startCheckout } from "@/lib/billing/checkout";
import { paymentsConfigured } from "@/lib/billing/config";
import { getPlan } from "@/lib/billing/quote";
import { json, fail, readJson } from "@/lib/http";
import { log } from "@/lib/logger";
import { allowAttempt } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ name?: string; email?: string; password?: string; planId?: string }>(request);
    if (!body.email?.trim() || !body.password || !body.planId?.trim()) {
      return json({ error: "Enter your email, a password, and a plan" }, 400);
    }
    const plan = getPlan(body.planId.trim());
    if (!plan) return json({ error: "Choose a plan to continue" }, 400);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!(await allowAttempt(`signup:${ip}`, 5, 60 * 60))) {
      return json({ error: "Too many sign-ups from this network. Try again later." }, 429);
    }
    if (!(await allowAttempt(`signup-email:${normalizeEmail(body.email)}`, 5, 60 * 60))) {
      return json({ error: "Too many sign-ups for that email. Try again later." }, 429);
    }
    const user = await createUser({ name: body.name, email: body.email, password: body.password, planId: plan.id });
    let checkoutUrl: string | null = null;
    if (paymentsConfigured()) {
      try {
        const account = await loadAccountBilling(user.id);
        checkoutUrl = await startCheckout({
          userId: user.id,
          email: user.email,
          name: user.name,
          planId: plan.id,
          customerId: account?.stripeCustomerId ?? null,
        });
      } catch (error) {
        log.warn("Could not start checkout after signup", error instanceof Error ? error.message : error);
      }
    }
    const response = json({ user, checkoutUrl, next: checkoutUrl ? null : "/billing" });
    response.headers.append("set-cookie", sessionCookie(createSessionToken(user.id)));
    return response;
  } catch (error) {
    return fail(error, "Could not create account");
  }
}
