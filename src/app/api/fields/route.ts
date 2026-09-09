import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customFields } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    const db = await getDb();
    const rows = await db.select().from(customFields).where(eq(customFields.botId, botId));
    return json({ fields: rows.filter((field) => !field.key.startsWith("_")) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      botId?: string;
      key?: string;
      label?: string;
      fieldType?: string;
    }>(request);
    if (!body.botId || !body.key?.trim() || !body.label?.trim()) {
      return json({ error: "botId, key, and label are required" }, 400);
    }
    const db = await getDb();
    const [field] = await db
      .insert(customFields)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        key: body.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        label: body.label.trim(),
        fieldType: body.fieldType ?? "text",
      })
      .returning();
    return json({ field });
  } catch (error) {
    return fail(error, "Field already exists");
  }
}
