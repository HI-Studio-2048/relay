import { and, eq } from "drizzle-orm";
import { contactsFromCsv } from "@/lib/csv";
import { requireBotAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { contactAliases, contacts } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";
import { loadContactRecord, persistContact } from "@/lib/store";
import type { ContactRecord } from "@/lib/types";

/**
 * CSV import. Rows match an existing contact by id, email, phone or username and enrich it;
 * anything else becomes a CRM-only contact (it can be messaged once it writes in on a channel).
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; csv?: string; tag?: string }>(request);
    if (!body.botId || !body.csv?.trim()) return json({ error: "botId and csv are required" }, 400);
    await requireBotAccess(body.botId);
    if (body.csv.length > 5_000_000) return json({ error: "CSV is too large (5 MB max)" }, 413);
    const rows = contactsFromCsv(body.csv);
    if (rows.length === 0) return json({ error: "No rows found. The first line must be a header." }, 400);
    const db = await getDb();
    const existing = await db.select().from(contacts).where(eq(contacts.botId, body.botId));
    const byKey = new Map<string, string>();
    for (const row of existing) {
      byKey.set(`id:${row.telegramUserId}`, row.id);
      if (row.email) byKey.set(`email:${row.email.toLowerCase()}`, row.id);
      if (row.phone) byKey.set(`phone:${row.phone.replace(/\D/g, "")}`, row.id);
      if (row.username) byKey.set(`user:${row.username.toLowerCase()}`, row.id);
    }
    const importTag = body.tag?.trim();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      const keys = [
        row.externalId ? `id:${row.externalId}` : null,
        row.email ? `email:${row.email.toLowerCase()}` : null,
        row.phone && row.phone.replace(/\D/g, "").length >= 6 ? `phone:${row.phone.replace(/\D/g, "")}` : null,
        row.username ? `user:${row.username.toLowerCase()}` : null,
      ].filter(Boolean) as string[];
      if (keys.length === 0) {
        skipped += 1;
        continue;
      }
      const matchId = keys.map((key) => byKey.get(key)).find(Boolean);
      const base: ContactRecord | null = matchId ? await loadContactRecord(matchId) : null;
      const tags = [...new Set([...(base?.tags ?? []), ...row.tags, ...(importTag ? [importTag] : [])])];
      const record: ContactRecord = base
        ? {
            ...base,
            firstName: base.firstName || row.firstName,
            lastName: base.lastName || row.lastName,
            username: base.username || row.username,
            email: row.email ?? base.email,
            phone: row.phone ?? base.phone,
            customFields: { ...base.customFields, ...row.fields },
            tags,
          }
        : {
            id: crypto.randomUUID(),
            telegramUserId: row.externalId ?? `import:${keys[0]!.split(":").slice(1).join(":")}`,
            username: row.username,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            customFields: row.fields,
            tags,
            subscriptions: [],
            unsubscribed: false,
            welcomed: false,
            notes: "",
            inboxStatus: "open",
          };
      if (!base) {
        const [clash] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.botId, body.botId), eq(contacts.telegramUserId, record.telegramUserId)))
          .limit(1);
        // An id that belongs to a merged contact (alias) is that person too: don't split them again.
        const [aliased] = clash
          ? []
          : await db
              .select({ id: contactAliases.contactId })
              .from(contactAliases)
              .where(and(eq(contactAliases.botId, body.botId), eq(contactAliases.externalUserId, record.telegramUserId)))
              .limit(1);
        if (clash || aliased) {
          skipped += 1;
          continue;
        }
      }
      await persistContact(body.botId, record);
      for (const key of keys) byKey.set(key, record.id);
      if (base) updated += 1;
      else created += 1;
    }
    return json({ ok: true, created, updated, skipped });
  } catch (error) {
    return fail(error);
  }
}
