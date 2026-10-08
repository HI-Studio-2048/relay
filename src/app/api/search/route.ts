import { requireBotAccess } from "@/lib/auth";
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, flows } from "@/lib/db/schema";
import { json, fail } from "@/lib/http";

/** ⌘K palette: flows and contacts matching a query. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const botId = url.searchParams.get("botId");
    const q = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    if (q.length < 2) return json({ flows: [], contacts: [] });
    const like = `%${q.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
    const db = await getDb();
    const [flowRows, contactRows] = await Promise.all([
      db
        .select({ id: flows.id, name: flows.name, isActive: flows.isActive })
        .from(flows)
        .where(and(eq(flows.botId, botId), or(ilike(flows.name, like), ilike(flows.triggerValue, like))))
        .limit(6),
      db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, username: contacts.username, email: contacts.email, platform: contacts.platform })
        .from(contacts)
        .where(
          and(
            eq(contacts.botId, botId),
            or(ilike(contacts.firstName, like), ilike(contacts.lastName, like), ilike(contacts.username, like), ilike(contacts.email, like)),
          ),
        )
        .limit(6),
    ]);
    return json({
      flows: flowRows,
      contacts: contactRows.map((row) => ({
        id: row.id,
        name: [row.firstName, row.lastName].filter(Boolean).join(" ") || (row.username ? `@${row.username}` : "Contact"),
        detail: [row.username ? `@${row.username}` : null, row.email, row.platform].filter(Boolean).join(" · "),
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
