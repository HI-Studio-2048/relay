import { loadAccountBilling } from "@/lib/billing/account";
import { startPortal } from "@/lib/billing/checkout";
import { BillingError } from "@/lib/billing/errors";
import { currentUserId } from "@/lib/auth";
import { json, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const userId = await currentUserId();
    if (!userId) return json({ error: "Sign in to continue" }, 401);
    const account = await loadAccountBilling(userId);
    if (!account?.stripeCustomerId) return json({ error: "There's no payment profile for this account yet" }, 404);
    const url = await startPortal(account.stripeCustomerId);
    return json({ url });
  } catch (error) {
    if (error instanceof BillingError) return json({ error: error.message }, error.status);
    return fail(error, "Could not open billing");
  }
}
