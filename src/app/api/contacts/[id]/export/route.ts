import { asc, eq } from "drizzle-orm";
import { requireRowAccess } from "@/lib/auth/resources";
import { getDb } from "@/lib/db";
import { flowEvents, flows, messages } from "@/lib/db/schema";
import { publicContact } from "@/lib/developer";
import { fail, json, type RouteParams } from "@/lib/http";
import { loadContactRecord } from "@/lib/store";

/** Data-access request: everything Relay holds about one person, as a JSON download. */
export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("contact", id);
    const contact = await loadContactRecord(id);
    if (!contact) return json({ error: "Contact not found" }, 404);
    const db = await getDb();
    const [history, events] = await Promise.all([
      db
        .select({ at: messages.createdAt, direction: messages.direction, source: messages.source, body: messages.body })
        .from(messages)
        .where(eq(messages.contactId, id))
        .orderBy(asc(messages.createdAt)),
      db
        .select({ at: flowEvents.createdAt, kind: flowEvents.kind, flow: flows.name, goal: flowEvents.name, value: flowEvents.value, currency: flowEvents.currency })
        .from(flowEvents)
        // Left join: payments with no flow are part of the person's data too.
        .leftJoin(flows, eq(flows.id, flowEvents.flowId))
        .where(eq(flowEvents.contactId, id))
        .orderBy(asc(flowEvents.createdAt)),
    ]);
    const body = JSON.stringify(
      { exportedAt: new Date().toISOString(), contact: { ...publicContact(contact), notes: contact.notes ?? "" }, messages: history, automation: events },
      null,
      2,
    );
    return new Response(body, {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="contact-${id}.json"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
