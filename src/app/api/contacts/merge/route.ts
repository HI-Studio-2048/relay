import { MergeError, mergeContacts } from "@/lib/contact-merge";
import { json, fail, readJson } from "@/lib/http";

/** POST { keepId, dropId, confirm: true } folds the duplicate into the contact you keep. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ keepId?: string; dropId?: string; confirm?: unknown }>(request);
    if (body.confirm !== true) return json({ error: "Merging requires confirm: true", code: "CONFIRM_REQUIRED" }, 409);
    if (!body.keepId || !body.dropId) return json({ error: "keepId and dropId are required" }, 400);
    await mergeContacts(body.keepId, body.dropId);
    return json({ ok: true, contactId: body.keepId });
  } catch (error) {
    if (error instanceof MergeError) return json({ error: error.message }, 400);
    return fail(error);
  }
}
