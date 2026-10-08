import { eq, sql } from "drizzle-orm";
import { findDuplicatePairs } from "@/lib/contact-merge";
import { requireBotAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { contacts, messages } from "@/lib/db/schema";
import { json, fail } from "@/lib/http";

/** GET ?botId= → likely duplicates (same email or phone) with who to keep. */
export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    const db = await getDb();
    const rows = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        username: contacts.username,
        platform: contacts.platform,
        email: contacts.email,
        phone: contacts.phone,
        lastAt: sql<string | null>`(select max(${messages.createdAt}) from ${messages} where ${messages.contactId} = ${contacts.id})`,
      })
      .from(contacts)
      .where(eq(contacts.botId, botId));
    const people = new Map(rows.map((row) => [row.id, row]));
    const label = (id: string) => {
      const row = people.get(id)!;
      return {
        id,
        name: [row.firstName, row.lastName].filter(Boolean).join(" ") || (row.username ? `@${row.username}` : "Contact"),
        platform: row.platform,
        detail: row.email ?? row.phone ?? "",
      };
    };
    const pairs = findDuplicatePairs(rows.map((row) => ({ id: row.id, email: row.email, phone: row.phone, lastAt: row.lastAt ? Date.parse(row.lastAt) : 0 })));
    return json({ pairs: pairs.map((pair) => ({ reason: pair.reason, keep: label(pair.keepId), drop: label(pair.dropId) })) });
  } catch (error) {
    return fail(error);
  }
}
