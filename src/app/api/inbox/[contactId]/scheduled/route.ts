import { and, eq } from "drizzle-orm";
import { listScheduled } from "@/lib/agent-reply";
import { getDb } from "@/lib/db";
import { contacts, scheduledMessages } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { agentIdFromCookieHeader, findMember } from "@/lib/team";

export async function GET(_request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    return json({ scheduled: await listScheduled(contactId) });
  } catch (error) {
    return fail(error);
  }
}

/** POST { text, sendAt } queues a reply; DELETE ?id= cancels one that has not gone out. */
export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const body = await readJson<{ text?: string; sendAt?: string }>(request);
    const text = body.text?.trim();
    const sendAt = body.sendAt ? new Date(body.sendAt) : null;
    if (!text) return json({ error: "Message text is required" }, 400);
    if (!sendAt || !Number.isFinite(sendAt.getTime()) || sendAt.getTime() < Date.now() + 30_000) {
      return json({ error: "Pick a time at least a minute from now" }, 400);
    }
    if (sendAt.getTime() > Date.now() + 30 * 86_400_000) return json({ error: "Schedule at most 30 days ahead" }, 400);
    const db = await getDb();
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact) return json({ error: "Contact not found" }, 404);
    const agent = await findMember(agentIdFromCookieHeader(request.headers.get("cookie")));
    const [row] = await db
      .insert(scheduledMessages)
      .values({ id: crypto.randomUUID(), botId: contact.botId, contactId, body: text, sendAt, author: agent?.name ?? null })
      .returning();
    return json({ scheduled: row });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return json({ error: "id is required" }, 400);
    const db = await getDb();
    await db
      .update(scheduledMessages)
      .set({ status: "cancelled" })
      .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.contactId, contactId), eq(scheduledMessages.status, "pending")));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
