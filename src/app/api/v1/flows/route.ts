import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api-v1";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { json } from "@/lib/http";

export async function GET(request: Request) {
  return apiHandler(request, async (botId) => {
    const db = await getDb();
    const rows = await db.select().from(flows).where(eq(flows.botId, botId));
    return json({
      flows: rows.map((flow) => ({ id: flow.id, name: flow.name, active: flow.isActive, trigger: flow.triggerType, trigger_value: flow.triggerValue })),
    });
  });
}
