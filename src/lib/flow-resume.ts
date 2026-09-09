import { eq } from "drizzle-orm";
import { accountFromRow } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots, contacts } from "@/lib/db/schema";
import { applyFlowEffects } from "@/lib/flow-effects";
import { executeFrom } from "@/lib/flow-engine";
import { log } from "@/lib/logger";
import { deliverReplies } from "@/lib/flow-dispatch";
import {
  listDueDelaySessions,
  loadActiveFlows,
  loadContactRecord,
  persistContact,
  persistSession,
} from "@/lib/store";

export async function resumeDueDelays() {
  const rows = await listDueDelaySessions();
  if (rows.length === 0) return;

  const db = await getDb();
  for (const row of rows) {
    try {
      const [contactRow] = await db.select().from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
      if (!contactRow) continue;
      const contact = await loadContactRecord(contactRow.id);
      if (!contact) continue;
      const [bot] = await db.select().from(bots).where(eq(bots.id, contactRow.botId)).limit(1);
      if (!bot) continue;

      const flows = await loadActiveFlows(contactRow.botId);
      const flow = flows.find((item) => item.id === row.flowId);
      if (!flow) continue;

      const executed = executeFrom(
        flow.definition,
        {
          id: row.id,
          contactId: row.contactId,
          flowId: row.flowId,
          stepId: row.stepId,
          awaitingInput: row.awaitingInput,
          status: "active",
          formIndex: row.formIndex ?? undefined,
          resumeAt: row.resumeAt?.toISOString() ?? new Date(0).toISOString(),
        },
        contact,
        Date.now(),
        flows,
      );

      await persistContact(contactRow.botId, executed.contact);
      await persistSession(contactRow.id, executed.session?.status === "completed" ? null : executed.session);

      const account = accountFromRow(bot);
      await deliverReplies({ botId: contactRow.botId, account, contact: executed.contact, replies: executed.replies });
      await applyFlowEffects({
        botId: contactRow.botId,
        account,
        contact: executed.contact,
        effects: executed.effects,
      });
    } catch (error) {
      log.error("Delay resume failed", error instanceof Error ? error.message : error);
    }
  }
}
