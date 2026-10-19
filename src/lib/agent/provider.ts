import { desc, eq } from "drizzle-orm";
import { readAiProvider, type AiProvider } from "@/lib/ai-provider";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";

/**
 * Which key pays for the growth agent. The agent works across the whole login, while OpenRouter keys
 * are saved per account (bot). So: the login's own bots, most recently updated first, and the first
 * one with a readable OpenRouter key wins. Saving or changing a key bumps that bot's updated_at, so
 * the key most recently saved is usually the one used. No key on any bot means undefined, which
 * falls back to the server's ANTHROPIC_API_KEY.
 */
export async function workspaceAiProvider(ownerId: string): Promise<AiProvider | undefined> {
  const db = await getDb();
  const rows = await db
    .select({ id: bots.id, settings: bots.settings })
    .from(bots)
    .where(eq(bots.ownerId, ownerId))
    .orderBy(desc(bots.updatedAt), desc(bots.id));
  for (const row of rows) {
    const provider = readAiProvider(row.settings as Record<string, unknown> | null);
    if (provider) return provider;
  }
  return undefined;
}
