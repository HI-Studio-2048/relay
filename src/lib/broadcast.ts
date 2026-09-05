import type { BroadcastStatus } from "@/lib/types";

export const CONFIRM_REQUIRED = "CONFIRM_REQUIRED";

export class BroadcastConfirmError extends Error {
  readonly code = CONFIRM_REQUIRED;
  constructor(message = "Broadcasts require an explicit confirm: true before send.") {
    super(message);
    this.name = "BroadcastConfirmError";
  }
}

export function assertConfirm(confirm: unknown, action = "This action"): void {
  if (confirm !== true) {
    throw new BroadcastConfirmError(`${action} requires confirm: true.`);
  }
}

export function canDispatchBroadcast(input: {
  status: BroadcastStatus;
  confirm: unknown;
}): { ok: true } | { ok: false; code: string; error: string } {
  if (input.confirm !== true) {
    return {
      ok: false,
      code: CONFIRM_REQUIRED,
      error: "Broadcasts require an explicit confirm: true before send.",
    };
  }
  if (input.status !== "draft" && input.status !== "awaiting_confirm") {
    return {
      ok: false,
      code: "INVALID_STATUS",
      error: `Cannot send a broadcast in status "${input.status}".`,
    };
  }
  return { ok: true };
}

export function nextBroadcastStatusAfterConfirm(): Extract<BroadcastStatus, "queued"> {
  return "queued";
}

/** Global unsubscribe skips tag-scoped broadcasts. Confirm gate is unchanged. */
export function isBroadcastable(contact: { unsubscribed?: boolean | null }): boolean {
  return !contact.unsubscribed;
}
