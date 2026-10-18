import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hasWorkspaceAccess } from "@/lib/billing/access";

export async function workspaceGate(userId: string): Promise<"ok" | "unpaid" | "missing"> {
  const db = await getDb();
  const [row] = await db.select({ billingStatus: users.billingStatus }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return "missing";
  return hasWorkspaceAccess(row.billingStatus) ? "ok" : "unpaid";
}
