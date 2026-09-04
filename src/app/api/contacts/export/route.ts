import { json, fail } from "@/lib/http";
import { searchContacts } from "@/lib/store";
import { getDb } from "@/lib/db";
import { customFields } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    const db = await getDb();
    const fields = await db.select().from(customFields).where(eq(customFields.botId, botId));
    const rows = (await searchContacts(botId)).filter(Boolean);
    const header = [
      "telegram_user_id",
      "username",
      "first_name",
      "last_name",
      "email",
      "phone",
      "tags",
      ...fields.map((field) => field.key),
    ];
    const lines = [header.join(",")];
    for (const contact of rows) {
      if (!contact) continue;
      lines.push(
        [
          contact.telegramUserId,
          contact.username ?? "",
          contact.firstName ?? "",
          contact.lastName ?? "",
          contact.email ?? "",
          contact.phone ?? "",
          contact.tags.join("|"),
          ...fields.map((field) => contact.customFields[field.key] ?? ""),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    return new Response(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=relay-contacts.csv",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
