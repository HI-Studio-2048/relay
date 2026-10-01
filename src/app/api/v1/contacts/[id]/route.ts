import { apiHandler, ownedContactId } from "@/lib/api-v1";
import { publicContact } from "@/lib/developer";
import { json, readJson, type RouteParams } from "@/lib/http";
import { assignFieldValue, parseCaptureField } from "@/lib/lead-capture";
import { loadContactRecord, persistContact } from "@/lib/store";

export async function GET(request: Request, context: RouteParams<{ id: string }>) {
  return apiHandler(request, async (botId) => {
    const id = await ownedContactId(botId, (await context.params).id);
    return json({ contact: publicContact((await loadContactRecord(id))!) });
  });
}

/**
 * PATCH /api/v1/contacts/:id
 * { first_name?, last_name?, email?, phone?, fields?: {key: value}, add_tags?: [], remove_tags?: [] }
 * Tag and field changes fire automation rules and webhooks, same as in the app.
 */
export async function PATCH(request: Request, context: RouteParams<{ id: string }>) {
  return apiHandler(request, async (botId) => {
    const id = await ownedContactId(botId, (await context.params).id);
    const body = await readJson<{
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      phone?: string | null;
      fields?: Record<string, unknown>;
      add_tags?: unknown[];
      remove_tags?: unknown[];
    }>(request);
    let contact = (await loadContactRecord(id))!;
    if (body.first_name !== undefined) contact = { ...contact, firstName: body.first_name || null };
    if (body.last_name !== undefined) contact = { ...contact, lastName: body.last_name || null };
    if (body.email) contact = assignFieldValue(contact, parseCaptureField("email"), String(body.email));
    if (body.phone) contact = assignFieldValue(contact, parseCaptureField("phone"), String(body.phone));
    for (const [key, value] of Object.entries(body.fields ?? {})) {
      const clean = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (!clean || clean.startsWith("_")) continue;
      contact = { ...contact, customFields: { ...contact.customFields, [clean]: String(value ?? "") } };
    }
    const remove = new Set((body.remove_tags ?? []).map((tag) => String(tag).trim().toLowerCase()));
    const add = (body.add_tags ?? []).map((tag) => String(tag).trim()).filter(Boolean);
    const tags = contact.tags.filter((tag) => !remove.has(tag.toLowerCase()));
    for (const tag of add) if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) tags.push(tag);
    contact = { ...contact, tags };
    await persistContact(botId, contact);
    return json({ contact: publicContact((await loadContactRecord(id))!) });
  });
}
