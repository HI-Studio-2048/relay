import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, messages } from "@/lib/db/schema";

/** Same person, two channels: contacts sharing an email or phone (last 9 digits) in one account. */
export function findDuplicatePairs(
  rows: { id: string; email: string | null; phone: string | null; lastAt: number }[],
): { keepId: string; dropId: string; reason: string }[] {
  const pairs: { keepId: string; dropId: string; reason: string }[] = [];
  const seen = new Set<string>();
  const byKey = new Map<string, typeof rows>();
  for (const row of rows) {
    const keys = [
      row.email?.trim() ? `email:${row.email.trim().toLowerCase()}` : null,
      row.phone && row.phone.replace(/\D/g, "").length >= 7 ? `phone:${row.phone.replace(/\D/g, "").slice(-9)}` : null,
    ].filter(Boolean) as string[];
    for (const key of keys) byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    // Keep the one they talked to most recently: that is the channel replies should go to.
    const [keep, ...rest] = [...group].sort((a, b) => b.lastAt - a.lastAt);
    for (const drop of rest) {
      const id = [keep!.id, drop.id].sort().join("|");
      if (seen.has(id)) continue;
      seen.add(id);
      pairs.push({ keepId: keep!.id, dropId: drop.id, reason: key.startsWith("email:") ? "same email" : "same phone" });
    }
  }
  return pairs;
}

export class MergeError extends Error {}

/**
 * Fold `dropId` into `keepId` (same account): history, tags, field values, automation and growth
 * attribution move over; missing profile details are filled in; then the duplicate is removed. The
 * kept contact's channel stays the reply route.
 */
export async function mergeContacts(keepId: string, dropId: string) {
  if (keepId === dropId) throw new MergeError("Pick two different contacts");
  const db = await getDb();
  const [keep] = await db.select().from(contacts).where(eq(contacts.id, keepId)).limit(1);
  const [drop] = await db.select().from(contacts).where(eq(contacts.id, dropId)).limit(1);
  if (!keep || !drop) throw new MergeError("Contact not found");
  if (keep.botId !== drop.botId) throw new MergeError("Contacts belong to different accounts");
  await db.transaction(async (tx) => {
    await tx.update(messages).set({ contactId: keepId }).where(eq(messages.contactId, dropId));
    await tx.execute(sql`insert into contact_tags (contact_id, tag_id) select ${keepId}, tag_id from contact_tags where contact_id = ${dropId} on conflict do nothing`);
    await tx.execute(
      sql`insert into contact_field_values (contact_id, field_id, value) select ${keepId}, field_id, value from contact_field_values where contact_id = ${dropId} on conflict do nothing`,
    );
    await tx.execute(sql`update flow_events set contact_id = ${keepId} where contact_id = ${dropId}`);
    await tx.execute(sql`update growth_link_events set contact_id = ${keepId} where contact_id = ${dropId}`);
    // An opted-out duplicate's queued replies are dropped, not re-routed to the kept channel.
    if (drop.unsubscribed) {
      await tx.execute(sql`update scheduled_messages set status = 'cancelled' where contact_id = ${dropId} and status = 'pending'`);
    }
    await tx.execute(sql`update scheduled_messages set contact_id = ${keepId} where contact_id = ${dropId}`);
    await tx.execute(
      sql`update sequence_subscriptions set contact_id = ${keepId} where contact_id = ${dropId} and sequence_id not in (select sequence_id from sequence_subscriptions where contact_id = ${keepId})`,
    );
    await tx.update(contacts)
      .set({
        firstName: keep.firstName ?? drop.firstName,
        lastName: keep.lastName ?? drop.lastName,
        email: keep.email ?? drop.email,
        phone: keep.phone ?? drop.phone,
        notes: [keep.notes, drop.notes].filter((note) => note?.trim()).join("\n") || keep.notes,
        createdAt: keep.createdAt < drop.createdAt ? keep.createdAt : drop.createdAt,
        // Opting out on either channel opts the person out; list subscriptions add up.
        unsubscribed: keep.unsubscribed || drop.unsubscribed,
        subscriptions: [...new Set([...(keep.subscriptions ?? []), ...(drop.subscriptions ?? [])])],
      })
      .where(and(eq(contacts.id, keepId), eq(contacts.botId, keep.botId)));
    // Whatever is left (open sessions, broadcast receipts, duplicates of the above) goes with it.
    await tx.delete(contacts).where(eq(contacts.id, dropId));
  });
}
