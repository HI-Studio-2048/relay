import { findGrowthLinkBySlug, recordGrowthClick, telegramStartUrl } from "@/lib/growth-links";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await findGrowthLinkBySlug(slug);
  if (!link) return new Response("Growth link not found", { status: 404 });

  await recordGrowthClick(link.id);

  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, link.botId)).limit(1);
  const telegramUrl = telegramStartUrl(bot?.telegramUsername, link.slug);
  if (!telegramUrl) {
    return new Response("Bot has no Telegram username yet. Connect the bot in Settings.", { status: 409 });
  }
  return Response.redirect(telegramUrl, 302);
}
