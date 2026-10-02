import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { agentIdFromCookieHeader, findMember } from "@/lib/team";

/**
 * Record an admin action for the Activity log. The actor is the teammate this browser picked ("I am…"),
 * else "Admin" for the dashboard or "API" for API-key calls. Never throws: logging must not break the action.
 */
export async function logActivity(request: Request | null, botId: string, action: string, detail?: string | null) {
  try {
    let actor = request?.headers.get("authorization") ? "API" : "Admin";
    const member = await findMember(agentIdFromCookieHeader(request?.headers.get("cookie") ?? null));
    if (member) actor = member.name;
    const db = await getDb();
    await db.insert(activityLog).values({
      id: crypto.randomUUID(),
      botId,
      actor,
      action: action.slice(0, 80),
      detail: detail ? detail.slice(0, 300) : null,
    });
  } catch (error) {
    console.warn("[activity] could not log", error);
  }
}

export async function listActivity(botId: string, limit = 50) {
  const db = await getDb();
  return db.select().from(activityLog).where(eq(activityLog.botId, botId)).orderBy(desc(activityLog.createdAt)).limit(limit);
}
