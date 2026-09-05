import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { flows, growthLinks } from "@/lib/db/schema";
import {
  assertSlug,
  linksForFlow,
  listGrowthLinks,
  slugifyName,
} from "@/lib/growth-links";
import { fail, json, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const botId = search.get("botId");
    const flowId = search.get("flowId");
    if (!botId) return json({ error: "botId is required" }, 400);
    const links = await listGrowthLinks(botId);
    return json({ links: flowId ? linksForFlow(links, flowId) : links });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      botId?: string;
      name?: string;
      slug?: string;
      tagName?: string | null;
      flowId?: string | null;
      utmSource?: string | null;
      utmMedium?: string | null;
      utmCampaign?: string | null;
    }>(request);
    if (!body.botId || !body.name?.trim()) return json({ error: "botId and name are required" }, 400);
    const slug = assertSlug(body.slug?.trim() ? body.slug : slugifyName(body.name));
    const db = await getDb();

    if (body.flowId) {
      const [flow] = await db.select().from(flows).where(eq(flows.id, body.flowId)).limit(1);
      if (!flow || flow.botId !== body.botId) return json({ error: "Flow not found for this bot" }, 404);
    }

    const [link] = await db
      .insert(growthLinks)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: body.name.trim(),
        slug,
        tagName: body.tagName?.trim() || null,
        flowId: body.flowId || null,
        utmSource: body.utmSource?.trim() || null,
        utmMedium: body.utmMedium?.trim() || null,
        utmCampaign: body.utmCampaign?.trim() || null,
      })
      .returning();
    const [enriched] = (await listGrowthLinks(body.botId)).filter((item) => item.id === link?.id);
    return json({ link: enriched ?? link });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("growth_links_bot_slug")) {
      return json({ error: "That start param already exists for this bot." }, 409);
    }
    return fail(error, "Could not create growth link");
  }
}
