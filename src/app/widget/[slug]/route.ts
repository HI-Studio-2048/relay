import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { publicUrl } from "@/lib/env";
import { channelStartUrl, zernioEntryLinks } from "@/lib/growth";
import { findGrowthLinkBySlug } from "@/lib/growth-links";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = { instagram: "Instagram", facebook: "Messenger", messenger: "Messenger", whatsapp: "WhatsApp", telegram: "Telegram" };
const COLORS: Record<string, string> = { instagram: "#E1306C", facebook: "#0084FF", messenger: "#0084FF", whatsapp: "#25D366", telegram: "#229ED9" };

/**
 * Website chat widget: <script src="https://relay.example/widget/<slug>.js" async></script>.
 * A floating button that opens the visitor's preferred network through /go/<slug>?via=…,
 * so clicks, attribution and linked flows all apply. Options: ?color=%23hex&text=Chat%20with%20us&title=Message%20us
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const raw = (await params).slug.replace(/\.js$/, "");
  const link = await findGrowthLinkBySlug(raw);
  const js = (body: string, status = 200) =>
    new Response(body, {
      status,
      headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
    });
  if (!link) return js(`console.warn("Relay widget: link not found");`, 404);

  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, link.botId)).limit(1);
  if (!bot) return js(`console.warn("Relay widget: account not found");`, 404);

  const origin = publicUrl(request.url)!;
  const go = (via?: string) => `${origin}/go/${encodeURIComponent(link.slug)}${via ? `?via=${encodeURIComponent(via)}` : ""}`;
  const options =
    bot.channel === "zernio"
      ? zernioEntryLinks((bot.settings?.zernioAccounts as { platform: string; username: string | null }[] | undefined) ?? [], link.slug).map(
          (entry) => ({ label: LABELS[entry.platform] ?? entry.platform, color: COLORS[entry.platform] ?? "#1b1f24", url: go(entry.platform) }),
        )
      : channelStartUrl({ channel: bot.channel, handle: bot.telegramUsername, externalAccountId: bot.externalAccountId }, link.slug)
        ? [{ label: LABELS[bot.channel] ?? bot.channel, color: COLORS[bot.channel] ?? "#1b1f24", url: go() }]
        : [];

  const url = new URL(request.url);
  const color = /^#[0-9a-f]{3,8}$/i.test(url.searchParams.get("color") ?? "") ? url.searchParams.get("color")! : "#0084FF";
  const text = (url.searchParams.get("text") ?? "Chat with us").slice(0, 40);
  const title = (url.searchParams.get("title") ?? "Message us").slice(0, 60);
  const config = JSON.stringify({ options, color, text, title });

  return js(`(function () {
  if (window.__relayWidget) return; window.__relayWidget = true;
  var c = ${config};
  if (!c.options.length) return;
  var root = document.createElement("div");
  root.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif";
  var panel = document.createElement("div");
  panel.style.cssText = "display:none;margin-bottom:10px;width:250px;background:#fff;color:#1b1f24;border-radius:16px;box-shadow:0 8px 30px rgba(16,24,40,.18);padding:14px";
  var title = document.createElement("div");
  title.textContent = c.title; title.style.cssText = "font-weight:600;margin-bottom:2px";
  var sub = document.createElement("div");
  sub.textContent = "Pick where you'd like to chat"; sub.style.cssText = "color:#6b7280;font-size:12px;margin-bottom:8px";
  panel.appendChild(title); panel.appendChild(sub);
  c.options.forEach(function (o) {
    var a = document.createElement("a");
    a.href = o.url; a.target = "_blank"; a.rel = "noopener";
    a.textContent = o.label;
    a.style.cssText = "display:block;margin-top:6px;padding:10px 12px;border-radius:10px;color:#fff;text-decoration:none;font-weight:600;background:" + o.color;
    panel.appendChild(a);
  });
  var button = document.createElement("button");
  button.type = "button"; button.textContent = c.text;
  button.setAttribute("aria-expanded", "false");
  button.style.cssText = "display:block;margin-left:auto;border:0;border-radius:999px;padding:12px 18px;color:#fff;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(16,24,40,.25);background:" + c.color;
  button.onclick = function () {
    if (c.options.length === 1) { window.open(c.options[0].url, "_blank", "noopener"); return; }
    var open = panel.style.display !== "none";
    panel.style.display = open ? "none" : "block";
    button.setAttribute("aria-expanded", String(!open));
  };
  root.appendChild(panel); root.appendChild(button);
  (document.body || document.documentElement).appendChild(root);
})();`);
}
