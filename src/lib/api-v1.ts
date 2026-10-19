import { and, eq } from "drizzle-orm";
import { assertBotNotPaused, BillingPausedError } from "@/lib/billing/paused";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { ApiAuthError, authenticateApiKey } from "@/lib/developer";
import { fail, json } from "@/lib/http";

export class ApiNotFoundError extends Error {}

/** Wrap a public API handler: API-key auth, JSON errors with stable status codes. */
export async function apiHandler(request: Request, handler: (botId: string) => Promise<Response>) {
  try {
    const { botId } = await authenticateApiKey(request);
    await assertBotNotPaused(botId);
    return await handler(botId);
  } catch (error) {
    if (error instanceof ApiAuthError) return json({ error: error.message }, 401);
    if (error instanceof BillingPausedError) return json({ error: error.message }, 402);
    if (error instanceof ApiNotFoundError) return json({ error: error.message }, 404);
    return fail(error);
  }
}

/** A contact id that belongs to the key's account, or 404. */
export async function ownedContactId(botId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.botId, botId), eq(contacts.id, id)))
    .limit(1);
  if (!row) throw new ApiNotFoundError("Contact not found");
  return row.id;
}
