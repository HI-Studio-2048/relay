import { eq } from "drizzle-orm";
import { requireRowAccess, requireRowInBot } from "@/lib/auth/resources";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { MergeError, mergeContacts } from "@/lib/contact-merge";
import { json, fail, readJson } from "@/lib/http";

/** POST { keepId, dropId, confirm: true } folds the duplicate into the contact you keep. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ keepId?: string; dropId?: string; confirm?: unknown }>(request);
    if (body.confirm !== true) return json({ error: "Merging requires confirm: true", code: "CONFIRM_REQUIRED" }, 409);
    if (!body.keepId || !body.dropId) return json({ error: "keepId and dropId are required" }, 400);
    await requireRowInBot("contact", body.dropId, await requireRowAccess("contact", body.keepId));
    await mergeContacts(body.keepId, body.dropId);
    const db = await getDb();
    const [kept] = await db.select().from(contacts).where(eq(contacts.id, body.keepId)).limit(1);
    if (kept) await logActivity(request, kept.botId, "Merged duplicate contacts", [kept.firstName, kept.lastName].filter(Boolean).join(" ") || null);
    return json({ ok: true, contactId: body.keepId });
  } catch (error) {
    if (error instanceof MergeError) return json({ error: error.message }, 400);
    return fail(error);
  }
}
