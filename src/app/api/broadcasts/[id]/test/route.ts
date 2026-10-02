import { eq } from "drizzle-orm";
import { accountFromRow, channelTarget, sendChannelReply } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots, broadcasts, contacts } from "@/lib/db/schema";
import { startFlowForContact } from "@/lib/flow-dispatch";
import { interpolateTemplate } from "@/lib/flow-effects";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { loadContactRecord, saveMessage } from "@/lib/store";
import { botFieldValues } from "@/lib/template";

/** POST { contactId } — send this draft (both A/B versions) to one contact, e.g. yourself, before confirming. */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ contactId?: string }>(request);
    const db = await getDb();
    const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
    if (!broadcast) return json({ error: "Broadcast not found" }, 404);
    const [contact] = body.contactId ? await db.select().from(contacts).where(eq(contacts.id, body.contactId)).limit(1) : [];
    if (!contact || contact.botId !== broadcast.botId) return json({ error: "Pick a contact from this account" }, 400);
    const [bot] = await db.select().from(bots).where(eq(bots.id, broadcast.botId)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    if (broadcast.flowId) {
      await startFlowForContact({ contactId: contact.id, flowId: broadcast.flowId });
      return json({ ok: true, sent: 1 });
    }
    const record = await loadContactRecord(contact.id);
    const versions = [broadcast.body, ...(broadcast.bodyB?.trim() ? [broadcast.bodyB] : [])];
    for (const [index, text] of versions.entries()) {
      const personalized = record ? interpolateTemplate(text, record, botFieldValues(bot.settings)) : text;
      const label = versions.length > 1 ? `[test ${index === 0 ? "A" : "B"}] ` : "[test] ";
      const sent = await sendChannelReply(accountFromRow(bot), channelTarget(contact), { text: personalized, source: "broadcast" });
      await saveMessage({
        botId: bot.id,
        contactId: contact.id,
        direction: "outbound",
        source: "broadcast",
        body: `${label}${personalized}`,
        telegramMessageId: sent.message_id || null,
      });
    }
    return json({ ok: true, sent: versions.length });
  } catch (error) {
    return fail(error, "Could not send the test");
  }
}
