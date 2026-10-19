export type BillingStatus = "active" | "past_due" | "unpaid" | "canceled" | "none";

/**
 * Who gets into the workspace.
 * - `active`: a current subscription, or an account that existed before checkout.
 * - `past_due`: a renewal failed and Stripe is still retrying. The workspace stays open meanwhile.
 * - `unpaid`: Stripe gave up on the payment, or a refund, dispute or fraud warning came in. Closed.
 * - `canceled`: the subscription ended. Closed.
 * - `none`: signed up, checkout never finished. Closed.
 */
export function hasWorkspaceAccess(billingStatus: string | null | undefined): boolean {
  return billingStatus === "active" || billingStatus === "past_due";
}

/**
 * An account that had a plan and lost it. Its automations stop too, not only the login:
 * no flows, no AI replies, no broadcasts, no API. `none` is left out on purpose, because an
 * account that never paid can't get past the login to connect a channel in the first place.
 */
export function automationPaused(billingStatus: string | null | undefined): boolean {
  return billingStatus === "unpaid" || billingStatus === "canceled";
}

/** Map a Stripe subscription status onto our column. Trials never open a workspace. */
export function billingStatusFromStripe(status: string | null | undefined): BillingStatus {
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "unpaid") return "unpaid";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "none";
}
