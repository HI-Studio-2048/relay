import { eq } from "drizzle-orm";
import { requireBotAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { flows, growthLinks } from "@/lib/db/schema";
import {
  assertSlug,
  ensureFlowShareLink,
  listGrowthLinks,
  originFromRequest,
  presentStoredGrowthLink,
  slugifyName,
  slugTakenElsewhere,
} from "@/lib/growth-links";
import { fail, json, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const botId = url.searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    const flowId = url.searchParams.get("flowId");
    return json({
      links: await listGrowthLinks(botId, {
        origin: originFromRequest(request),
        flowId,
      }),
    });
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
      ensure?: boolean;
    }>(request);
    if (!body.botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(body.botId);
    const db = await getDb();
    const origin = originFromRequest(request);

    if (body.ensure) {
      if (!body.flowId) return json({ error: "flowId is required" }, 400);
      const [flow] = await db.select().from(flows).where(eq(flows.id, body.flowId)).limit(1);
      if (!flow || flow.botId !== body.botId) return json({ error: "Flow not found for this bot" }, 404);
      const preferredSlug =
        flow.triggerType === "start_param" && flow.triggerValue?.trim() ? flow.triggerValue : null;
      const { link, created } = await ensureFlowShareLink({
        botId: body.botId,
        flowId: flow.id,
        flowName: flow.name,
        preferredSlug,
      });
      return json({
        link: await presentStoredGrowthLink(link, { origin }),
        created,
      });
    }

    if (!body.name?.trim()) return json({ error: "botId and name are required" }, 400);
    const slug = assertSlug(body.slug?.trim() ? body.slug : slugifyName(body.name));

    if (body.flowId) {
      const [flow] = await db.select().from(flows).where(eq(flows.id, body.flowId)).limit(1);
      if (!flow || flow.botId !== body.botId) return json({ error: "Flow not found for this bot" }, 404);
    }
    if (await slugTakenElsewhere(body.botId, slug)) {
      return json({ error: "That link name is already taken. Try another." }, 409);
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
    const [enriched] = (
      await listGrowthLinks(body.botId, { origin })
    ).filter((item) => item.id === link?.id);
    return json({ link: enriched ?? link });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("growth_links_bot_slug")) {
      return json({ error: "That start param already exists for this bot." }, 409);
    }
    return fail(error, "Could not create growth link");
  }
}
