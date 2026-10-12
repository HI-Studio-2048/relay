import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { channelStartUrl } from "@/lib/growth";
import { findGrowthLinkBySlug, recordGrowthClick } from "@/lib/growth-links";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await findGrowthLinkBySlug(slug);
  if (!link) return new Response("Link not found", { status: 404 });

  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, link.botId)).limit(1);
  if (!bot) return new Response("Link not found", { status: 404 });

  const target = channelStartUrl({ channel: bot.channel, handle: bot.telegramUsername, externalAccountId: bot.externalAccountId }, link.slug);
  if (!target) {
    return new Response("This account has no public handle yet. Reconnect it in Settings.", { status: 409 });
  }
  await recordGrowthClick(link.id);
  return Response.redirect(target, 302);
}
