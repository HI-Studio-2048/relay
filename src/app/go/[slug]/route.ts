import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { channelStartUrl, zernioEntryLinks, type EntryLink } from "@/lib/growth";
import { findGrowthLinkBySlug, recordGrowthClick } from "@/lib/growth-links";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = { instagram: "#E1306C", facebook: "#0084FF", whatsapp: "#25D366", telegram: "#229ED9" };

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** A tiny "continue on…" page when one link can open several networks. */
function chooserPage(title: string, entries: EntryLink[]) {
  const buttons = entries
    .map(
      (entry) =>
        `<a class="btn" style="background:${COLORS[entry.platform] ?? "#1b1f24"}" href="${escape(entry.url)}">Continue on ${escape(entry.label)}<span>${entry.platform === "whatsapp" ? "" : "@"}${escape(entry.handle)}</span></a>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f4f6f8;--card:#fff;--ink:#1b1f24;--muted:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#111315;--card:#1b1e21;--ink:#f3f4f6;--muted:#9ca3af}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);font:15px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);padding:16px}
.card{width:100%;max-width:380px;background:var(--card);border-radius:20px;padding:28px 22px;box-shadow:0 1px 3px rgba(16,24,40,.12);text-align:center}
h1{font-size:19px;margin:0 0 6px}p{margin:0 0 20px;color:var(--muted)}
.btn{display:flex;flex-direction:column;gap:2px;text-decoration:none;color:#fff;font-weight:600;border-radius:14px;padding:13px 16px;margin-top:10px}
.btn span{font-weight:400;font-size:12px;opacity:.85}
</style></head><body><main class="card"><h1>${escape(title)}</h1><p>Pick where you'd like to chat.</p>${buttons}</main></body></html>`;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await findGrowthLinkBySlug(slug);
  if (!link) return new Response("Link not found", { status: 404 });

  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, link.botId)).limit(1);
  if (!bot) return new Response("Link not found", { status: 404 });

  if (bot.channel === "zernio") {
    const accounts = (bot.settings?.zernioAccounts as { platform: string; username: string | null }[] | undefined) ?? [];
    const entries = zernioEntryLinks(accounts, link.slug);
    const via = new URL(request.url).searchParams.get("via");
    const chosen = via ? entries.find((entry) => entry.platform === via) : entries.length === 1 ? entries[0] : null;
    if (entries.length === 0) return new Response("No DM-capable account is connected for this link yet.", { status: 409 });
    if (chosen) {
      await recordGrowthClick(link.id);
      return Response.redirect(chosen.url, 302);
    }
    await recordGrowthClick(link.id);
    return new Response(chooserPage(link.name || bot.name, entries), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const target = channelStartUrl({ channel: bot.channel, handle: bot.telegramUsername, externalAccountId: bot.externalAccountId }, link.slug);
  if (!target) {
    return new Response("This account has no public handle yet. Reconnect it in Settings.", { status: 409 });
  }
  await recordGrowthClick(link.id);
  return Response.redirect(target, 302);
}
