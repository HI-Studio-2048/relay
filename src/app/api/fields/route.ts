import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contactFieldValues, customFields, flows } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const botId = url.searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    const db = await getDb();
    const [rows, counts, flowRows] = await Promise.all([
      db.select().from(customFields).where(eq(customFields.botId, botId)),
      db
        .select({ fieldId: contactFieldValues.fieldId, count: sql<number>`count(*)::int` })
        .from(contactFieldValues)
        .innerJoin(customFields, eq(customFields.id, contactFieldValues.fieldId))
        .where(eq(customFields.botId, botId))
        .groupBy(contactFieldValues.fieldId),
      url.searchParams.get("usage") ? db.select({ definition: flows.definition }).from(flows).where(eq(flows.botId, botId)) : Promise.resolve([]),
    ]);
    const flowTexts = flowRows.map((flow) => JSON.stringify(flow.definition));
    return json({
      fields: rows
        .filter((field) => !field.key.startsWith("_"))
        .map((field) => ({
          ...field,
          contacts: counts.find((row) => row.fieldId === field.id)?.count ?? 0,
          // Flows that read or write it: "custom:key" in a step, or {{key}} / {{field:key}} in text.
          flows: flowTexts.filter((text) => text.includes(`custom:${field.key}"`) || text.includes(`{{${field.key}`) || text.includes(`{{field:${field.key}`)).length,
        })),
    });
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
