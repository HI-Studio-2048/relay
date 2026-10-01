import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, flows } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";
import { isBotPaused, listMessages, loadActiveSession, loadContactRecord } from "@/lib/store";

export async function GET(_request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const contact = await loadContactRecord(contactId);
    if (!contact) return json({ error: "Contact not found" }, 404);
    const db = await getDb();
    const [row] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    const [messages, session, flowRows] = await Promise.all([
      listMessages(contactId),
      loadActiveSession(contactId),
      row ? db.select().from(flows).where(eq(flows.botId, row.botId)) : Promise.resolve([]),
    ]);
    return json({
      assignedTo: row?.assignedTo ?? null,
      contact,
      messages,
      automation: {
        status: session?.status === "paused" || (row && isBotPaused(row)) ? "paused" : session ? session.status : "idle",
        pausedUntil: row?.botPausedUntil ? new Date(row.botPausedUntil).toISOString() : null,
        flowId: session?.flowId ?? null,
        flowName: session ? flowRows.find((flow) => flow.id === session.flowId)?.name ?? null : null,
      },
      flows: flowRows
        .filter((flow) => flow.isActive)
        .map((flow) => ({ id: flow.id, name: flow.name })),
    });
  } catch (error) {
    return fail(error);
  }
}
