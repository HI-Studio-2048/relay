import { requireRowAccess } from "@/lib/auth/resources";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { loadContactRecord, persistContact } from "@/lib/store";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("contact", id);
    const contact = await loadContactRecord(id);
    if (!contact) return json({ error: "Contact not found" }, 404);
    return json({ contact });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("contact", id);
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
    };
    await persistContact(row!.botId, next);
    return json({ contact: await loadContactRecord(id) });
  } catch (error) {
    return fail(error);
  }
}
