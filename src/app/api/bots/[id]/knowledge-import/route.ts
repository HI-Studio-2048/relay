import { eq } from "drizzle-orm";
import { AiUnavailableError, extractKnowledge } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { WebImportError, checkImportUrl, fetchPageText } from "@/lib/web-import";

/** POST { url } → { knowledge } distilled from that page, for the owner to review before saving. */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ url?: string }>(request);
    if (!body.url?.trim()) return json({ error: "Paste a link to import" }, 400);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const url = checkImportUrl(body.url);
    const pageText = await fetchPageText(url);
    const knowledge = await extractKnowledge({ pageText, url: url.toString(), brandName: bot.name });
    return json({ knowledge, source: url.toString() });
  } catch (error) {
    if (error instanceof WebImportError) return json({ error: error.message }, 400);
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "TypeError")) {
      return json({ error: "Could not reach that page" }, 400);
    }
    return fail(error);
  }
}
