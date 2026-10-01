import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots, contacts, sequenceSubscriptions } from "@/lib/db/schema";
import { interpolateTemplate } from "@/lib/flow-effects";
import { log } from "@/lib/logger";
import { acquireSendSlot } from "@/lib/rate-limit";
import { loadContactRecord, saveMessage } from "@/lib/store";
import { listDueSequenceSends, loadSequenceStep } from "@/lib/sequences";
import { accountFromRow, channelTarget, sendChannelReply } from "@/lib/channels";
import { isBroadcastable } from "@/lib/broadcast";
import { botFieldValues } from "@/lib/template";

export async function resumeDueSequences() {
  const due = await listDueSequenceSends();
  if (due.length === 0) return;
  const db = await getDb();

  for (const sub of due) {
    try {
      const [contactRow] = await db.select().from(contacts).where(eq(contacts.id, sub.contactId)).limit(1);
      if (!contactRow || !isBroadcastable(contactRow)) {
        await db.update(sequenceSubscriptions).set({ status: "unsubscribed" }).where(eq(sequenceSubscriptions.id, sub.id));
        continue;
      }
      const [bot] = await db.select().from(bots).where(eq(bots.id, contactRow.botId)).limit(1);
      if (!bot) continue;

      const { step, total } = await loadSequenceStep(sub.sequenceId, sub.nextIndex);
      if (!step) {
        await db.update(sequenceSubscriptions).set({ status: "completed" }).where(eq(sequenceSubscriptions.id, sub.id));
        continue;
      }

      if (step.flowId) {
        // Flow step: the contact starts that flow (buttons, questions and delays included).
        const { startFlowForContact } = await import("@/lib/flow-dispatch");
        await startFlowForContact({ contactId: contactRow.id, flowId: step.flowId });
      } else {
        const contact = await loadContactRecord(contactRow.id);
        const body = contact ? interpolateTemplate(step.body, contact, botFieldValues(bot.settings)) : step.body;
        await acquireSendSlot(contactRow.botId, contactRow.telegramUserId);
        const sent = await sendChannelReply(accountFromRow(bot), channelTarget(contactRow), { text: body, source: "flow" });
        await saveMessage({
          botId: contactRow.botId,
          contactId: contactRow.id,
          direction: "outbound",
          source: "flow",
          body,
          telegramMessageId: sent.message_id || null,
        });
      }

      const nextIndex = sub.nextIndex + 1;
      if (nextIndex >= total) {
        await db.update(sequenceSubscriptions).set({ status: "completed", nextIndex }).where(eq(sequenceSubscriptions.id, sub.id));
        continue;
      }
      const { step: upcoming } = await loadSequenceStep(sub.sequenceId, nextIndex);
      await db
        .update(sequenceSubscriptions)
        .set({
          nextIndex,
          nextAt: new Date(Date.now() + Math.max(0, upcoming?.delaySeconds ?? 0) * 1000),
        })
        .where(eq(sequenceSubscriptions.id, sub.id));
    } catch (error) {
      log.error("Sequence send failed", error instanceof Error ? error.message : error);
    }
  }
}
