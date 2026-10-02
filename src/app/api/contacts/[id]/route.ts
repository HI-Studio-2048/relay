import { logActivity } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { loadContactRecord, persistContact } from "@/lib/store";
import { sendCsatSurvey } from "@/lib/csat-send";
import { emitWebhookSoon, publicContact } from "@/lib/developer";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const contact = await loadContactRecord(id);
    if (!contact) return json({ error: "Contact not found" }, 404);
    return json({ contact });
  } catch (error) {
    return fail(error);
  }
}

/** Erase a person (right to be forgotten). Messages, tags, fields and sessions cascade; analytics keep an anonymous row. */
export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ confirm?: unknown }>(request).catch(() => ({ confirm: undefined }));
    if (body.confirm !== true) return json({ error: "Erasing a contact requires confirm: true", code: "CONFIRM_REQUIRED" }, 409);
    const db = await getDb();
    const [removed] = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    if (!removed) return json({ error: "Contact not found" }, 404);
    const who = [removed.firstName, removed.lastName].filter(Boolean).join(" ") || (removed.username ? `@${removed.username}` : "a contact");
    await logActivity(request, removed.botId, "Erased contact", who);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const contact = await loadContactRecord(id);
    if (!contact) return json({ error: "Contact not found" }, 404);
    const db = await getDb();
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    const body = await readJson<{
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      customFields?: Record<string, string>;
      notes?: string;
      inboxStatus?: "open" | "closed";
      /** Replace the tag list. Goes through persistContact so tag rules fire. */
      tags?: string[];
    }>(request);
    const next = {
      ...contact,
      firstName: body.firstName !== undefined ? body.firstName : contact.firstName,
      lastName: body.lastName !== undefined ? body.lastName : contact.lastName,
      email: body.email !== undefined ? body.email : contact.email,
      phone: body.phone !== undefined ? body.phone : contact.phone,
      customFields: { ...contact.customFields, ...body.customFields },
      notes: body.notes !== undefined ? body.notes : contact.notes,
      inboxStatus: body.inboxStatus !== undefined ? body.inboxStatus : contact.inboxStatus,
      tags: Array.isArray(body.tags)
        ? [...new Set(body.tags.map((tag) => String(tag).trim()).filter(Boolean))]
        : contact.tags,
    };
    await persistContact(row!.botId, next);
    // Closing a conversation a teammate handled can ask the person to rate it (CSAT).
    const closing = body.inboxStatus === "closed" && contact.inboxStatus !== "closed";
    const surveyed = closing ? await sendCsatSurvey(id) : false;
    if (closing) emitWebhookSoon(row!.botId, "conversation.closed", { contact: publicContact(next), surveyed });
    return json({ contact: await loadContactRecord(id), surveyed });
  } catch (error) {
    return fail(error);
  }
}
