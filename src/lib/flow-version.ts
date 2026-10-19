import { sql } from "drizzle-orm";
import { flows } from "@/lib/db/schema";

/**
 * Stale-save check for the flow editor. The editor remembers the flow's `updated_at` from when it loaded
 * (as an ISO string, millisecond precision) and sends it back as `baseUpdatedAt` on every save. The save
 * only lands when the stored flow still has that version, so a tab opened before someone else's change
 * can't quietly overwrite it. Callers that send no version (API, agent, imports) are not checked.
 */
export const STALE_FLOW_CODE = "stale_flow";
export const STALE_FLOW_MESSAGE =
  "This flow was changed somewhere else since you opened it. Reload to get the latest version, then make your change again.";

/** The version string the editor holds for a flow. */
export function flowVersionOf(updatedAt: Date | string) {
  return new Date(updatedAt).toISOString();
}

/** Reads `baseUpdatedAt` from a request body. Undefined means "no check"; anything unparseable is an error. */
export function readBaseVersion(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error("baseUpdatedAt must be an ISO timestamp");
  return date.toISOString();
}

/**
 * WHERE clause matching a flow still at `base`. Postgres keeps microseconds and JS only milliseconds,
 * so both sides are compared at millisecond precision. `base` is a string, never a raw Date (Railway's driver rejects that).
 */
export function flowStillAt(base: string) {
  return sql`date_trunc('milliseconds', ${flows.updatedAt}) = date_trunc('milliseconds', ${base}::timestamptz)`;
}
