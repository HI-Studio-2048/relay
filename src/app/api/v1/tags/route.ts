import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api-v1";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { json } from "@/lib/http";

export async function GET(request: Request) {
  return apiHandler(request, async (botId) => {
    const db = await getDb();
    const rows = await db.select().from(tags).where(eq(tags.botId, botId));
    return json({ tags: rows.map((tag) => ({ id: tag.id, name: tag.name })) });
  });
}
