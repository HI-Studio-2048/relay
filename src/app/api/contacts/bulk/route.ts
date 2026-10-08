import { and, eq, inArray } from "drizzle-orm";
import { assertConfirm } from "@/lib/broadcast";
import { requireBotAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { startFlowForContact } from "@/lib/flow-dispatch";
import { json, fail, readJson } from "@/lib/http";
import { log } from "@/lib/logger";
import { loadContactRecord, persistContact } from "@/lib/store";

type Action = "add_tag" | "remove_tag" | "send_flow" | "subscribe" | "unsubscribe" | "delete";

/** Contacts page bulk actions. Tag changes go through persistContact so automation rules fire. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; contactIds?: string[]; action?: Action; value?: string; confirm?: unknown }>(request);
    const ids = [...new Set(body.contactIds ?? [])].slice(0, 5000);
    const value = body.value?.trim() ?? "";
    if (!body.botId || ids.length === 0 || !body.action) return json({ error: "botId, contactIds and action are required" }, 400);
    await requireBotAccess(body.botId);
    const db = await getDb();
    const owned = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.botId, body.botId), inArray(contacts.id, ids)));
    const targets = owned.map((row) => row.id);

    if (body.action === "delete") {
      assertConfirm(body.confirm, "Deleting contacts");
      if (targets.length) await db.delete(contacts).where(inArray(contacts.id, targets));
      return json({ ok: true, affected: targets.length });
    }

    let affected = 0;
    const errors: string[] = [];
    for (const id of targets) {
      try {
        if (body.action === "send_flow") {
          if (!value) return json({ error: "Pick a flow" }, 400);
          await startFlowForContact({ contactId: id, flowId: value });
          affected += 1;
          continue;
        }
        const contact = await loadContactRecord(id);
        if (!contact) continue;
        const lower = value.toLowerCase();
        if ((body.action === "add_tag" || body.action === "remove_tag") && !value) return json({ error: "Enter a tag" }, 400);
        let next = contact;
        if (body.action === "add_tag" && !contact.tags.some((tag) => tag.toLowerCase() === lower)) next = { ...contact, tags: [...contact.tags, value] };
        if (body.action === "remove_tag") next = { ...contact, tags: contact.tags.filter((tag) => tag.toLowerCase() !== lower) };
        if (body.action === "unsubscribe") next = { ...contact, unsubscribed: true };
        if (body.action === "subscribe") next = { ...contact, unsubscribed: false };
        if (next !== contact) {
          await persistContact(body.botId, next);
          affected += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed";
        errors.push(message);
        log.warn("Bulk action failed for a contact", message);
      }
    }
    return json({ ok: true, affected, failed: errors.length, error: errors[0] ?? null });
  } catch (error) {
    return fail(error);
  }
}
