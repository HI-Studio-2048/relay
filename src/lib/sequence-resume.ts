import { and, eq } from "drizzle-orm";
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

      // Claim this step before sending: if the sequence was edited (subscriber remapped) or another
      // worker got here first, next_index no longer matches and this round skips them.
      const nextIndex = sub.nextIndex + 1;
      const claimed = await db
        .update(sequenceSubscriptions)
        .set({ nextIndex, nextAt: new Date(Date.now() + 3_600_000) })
        .where(and(eq(sequenceSubscriptions.id, sub.id), eq(sequenceSubscriptions.nextIndex, sub.nextIndex), eq(sequenceSubscriptions.status, "active")))
        .returning();
      if (claimed.length === 0) continue;
      const release = () =>
        db
          .update(sequenceSubscriptions)
          .set({ nextIndex: sub.nextIndex, nextAt: new Date() })
          .where(and(eq(sequenceSubscriptions.id, sub.id), eq(sequenceSubscriptions.nextIndex, nextIndex)));
      try {
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
      } catch (error) {
        // Not sent: put them back so the next tick retries this step.
        await release().catch(() => undefined);
        throw error;
      }

      // Only if nobody remapped them meanwhile (an edit moves next_index; leave its choice alone).
      const stillHere = and(eq(sequenceSubscriptions.id, sub.id), eq(sequenceSubscriptions.nextIndex, nextIndex));
      if (nextIndex >= total) {
        await db.update(sequenceSubscriptions).set({ status: "completed" }).where(stillHere);
        continue;
      }
      const { step: upcoming } = await loadSequenceStep(sub.sequenceId, nextIndex);
      await db
        .update(sequenceSubscriptions)
        .set({
          nextIndex,
          nextAt: new Date(Date.now() + Math.max(0, upcoming?.delaySeconds ?? 0) * 1000),
        })
        .where(stillHere);
    } catch (error) {
      log.error("Sequence send failed", error instanceof Error ? error.message : error);
    }
  }
}
