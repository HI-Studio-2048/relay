import { hasWorkspaceAccess } from "@/lib/billing/access";
import { loadAccountBilling } from "@/lib/billing/account";
import { startCheckout } from "@/lib/billing/checkout";
import { paymentsConfigured } from "@/lib/billing/config";
import { BillingError } from "@/lib/billing/errors";
import { getPlan } from "@/lib/billing/quote";
import { currentUserId } from "@/lib/auth";
import { json, fail, readJson } from "@/lib/http";
import { allowAttempt } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return json({ error: "Sign in to continue" }, 401);
    const body = await readJson<{ planId?: string }>(request);
    const plan = getPlan(body.planId?.trim());
    if (!plan) return json({ error: "Choose a plan to continue" }, 400);
    if (!paymentsConfigured()) return json({ error: "Checkout isn't available yet. Your account is saved." }, 503);
    if (!(await allowAttempt(`checkout:${userId}`, 10, 60 * 60))) {
      return json({ error: "Too many checkout attempts. Try again later." }, 429);
    }
    const account = await loadAccountBilling(userId);
    if (!account) return json({ error: "Sign in to continue" }, 401);
    if (hasWorkspaceAccess(account.billingStatus) && account.stripeSubscriptionId) {
      return json({ error: "This account already has a plan" }, 409);
    }
    const url = await startCheckout({
      userId: account.id,
      email: account.email,
      name: account.name,
      planId: plan.id,
      customerId: account.stripeCustomerId,
    });
    return json({ url });
  } catch (error) {
    if (error instanceof BillingError) return json({ error: error.message }, error.status);
    return fail(error, "Could not start checkout");
  }
}
