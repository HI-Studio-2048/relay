import { requireRowAccess } from "@/lib/auth/resources";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { snoozeContact } from "@/lib/store";

/** POST { until: ISO time } snoozes a conversation; { until: null } wakes it. */
export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    await requireRowAccess("contact", contactId);
    const body = await readJson<{ until?: unknown }>(request);
    if (body.until === null || body.until === undefined) {
      await snoozeContact(contactId, null);
      return json({ ok: true, snoozedUntil: null });
    }
    const until = typeof body.until === "string" ? new Date(body.until) : null;
    if (!until || !Number.isFinite(until.getTime()) || until.getTime() <= Date.now()) {
      return json({ error: "Pick a time in the future" }, 400);
    }
    if (until.getTime() > Date.now() + 90 * 86_400_000) return json({ error: "Snooze for at most 90 days" }, 400);
    await snoozeContact(contactId, until);
    return json({ ok: true, snoozedUntil: until.toISOString() });
  } catch (error) {
    return fail(error);
  }
}
