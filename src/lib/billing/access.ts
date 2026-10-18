/** Workspace access is paid. `active` is a current subscription, or an account that existed before checkout. */
export function hasWorkspaceAccess(billingStatus: string | null | undefined): boolean {
  return billingStatus === "active";
}

/** Map a Stripe subscription status onto our column. Trials never open a workspace. */
export function billingStatusFromStripe(status: string | null | undefined): "active" | "past_due" | "canceled" | "none" {
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "none";
}
