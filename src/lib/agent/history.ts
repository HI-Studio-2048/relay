import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agentMessages, type AgentMessageMeta } from "@/lib/db/schema";

const KEEP = 200;

export async function listAgentHistory(ownerId: string) {
  const db = await getDb();
  const rows = await db.select().from(agentMessages).where(eq(agentMessages.ownerId, ownerId)).orderBy(asc(agentMessages.createdAt));
  return rows.slice(-80).map((row) => ({
    id: row.id,
    role: row.role,
    body: row.body,
    meta: (row.meta ?? {}) as AgentMessageMeta,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }));
}

export async function appendAgentMessage(input: { ownerId: string; role: "user" | "assistant"; body: string; meta?: AgentMessageMeta }) {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(agentMessages).values({
    id,
    ownerId: input.ownerId,
    role: input.role,
    body: input.body,
    meta: input.meta ?? {},
  });
  const rows = await db.select({ id: agentMessages.id }).from(agentMessages).where(eq(agentMessages.ownerId, input.ownerId)).orderBy(asc(agentMessages.createdAt));
  const extra = rows.slice(0, Math.max(0, rows.length - KEEP));
  if (extra.length) await db.delete(agentMessages).where(inArray(agentMessages.id, extra.map((row) => row.id)));
  return id;
}

/** "New chat": the login's whole conversation goes. Drafts it saved stay where they are. */
export async function clearAgentHistory(ownerId: string) {
  const db = await getDb();
  await db.delete(agentMessages).where(eq(agentMessages.ownerId, ownerId));
}
