"use client";

import { toast } from "sonner";
import { PlatformDot } from "@/components/chrome/platform-badge";
import { Button } from "@/components/ui/button";
import type { GrowthLinkView } from "@/lib/growth";

export async function copyGrowthText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${label}`);
    return true;
  } catch {
    toast.error("Could not copy");
    return false;
  }
}

function widgetSnippet(link: GrowthLinkView) {
  const origin = link.shortUrl.startsWith("http") ? new URL(link.shortUrl).origin : "";
  return `<script src="${origin}/widget/${link.slug}.js?text=Chat%20with%20us" async></script>`;
}

export function growthLinkSubtitle(link: GrowthLinkView) {
  return `ref ${link.slug} · ${link.clickCount} click${link.clickCount === 1 ? "" : "s"} · ${link.startCount} start${link.startCount === 1 ? "" : "s"}${link.tagName ? ` · tag ${link.tagName}` : ""}${link.flowName ? ` · ${link.flowName}` : ""}`;
}

export function GrowthLinkShareActions({
  link,
  showQr = true,
  qrSize = 180,
  onDelete,
}: {
  link: GrowthLinkView;
  showQr?: boolean;
  qrSize?: number;
  onDelete?: () => void;
}) {
  return (
    <>
      {link.utmSource || link.utmMedium || link.utmCampaign ? (
        <p className="mt-1 text-[11px] text-[#6b7280]">
          {[link.utmSource, link.utmMedium, link.utmCampaign].filter(Boolean).join(" / ")}
        </p>
      ) : null}
      <p className="mt-1 break-all text-[12px] text-[#1b1f24]">{link.shortUrl}</p>
      {link.entries?.length ? (
        <ul className="mt-1 space-y-0.5">
          {link.entries.map((entry) => (
            <li key={entry.url} className="flex items-center gap-1.5 text-[12px] text-[#6b7280]">
              <PlatformDot platform={entry.platform} />
              <button type="button" className="truncate text-left hover:text-[#1b1f24]" onClick={() => void copyGrowthText(entry.url, `${entry.label} link`)}>
                {entry.url}
              </button>
            </li>
          ))}
          {link.entries.length > 1 ? (
            <li className="text-[11px] text-[#8b95a1]">The short URL lets people pick; add ?via=instagram to skip the choice.</li>
          ) : null}
        </ul>
      ) : link.telegramUrl ? (
        <p className="mt-0.5 break-all text-[12px] text-[#6b7280]">{link.telegramUrl}</p>
      ) : (
        <p className="mt-0.5 text-[12px] text-[#6b7280]">Connect an account with a public handle to get a deep link.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-[#e5e7eb] bg-white text-[#1b1f24]"
          onClick={() => void copyGrowthText(link.shortUrl, "short URL")}
        >
          Copy short URL
        </Button>
        {link.telegramUrl && !link.entries?.length ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-[#1b1f24]"
            onClick={() => void copyGrowthText(link.telegramUrl!, "t.me start link")}
          >
            Copy deep link
          </Button>
        ) : null}
        {onDelete ? (
          <Button size="sm" variant="ghost" className="text-[#1b1f24]" onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
      <details className="mt-2 text-[12px] text-[#6b7280]">
        <summary className="cursor-pointer font-medium text-[#1b1f24]">Website chat widget</summary>
        <p className="mt-1">Paste before &lt;/body&gt; on your site. Clicks count on this link.</p>
        <button
          type="button"
          className="mt-1 block w-full rounded-lg bg-[#0f172a] p-2 text-left font-mono text-[11px] break-all text-[#e2e8f0]"
          onClick={() => void copyGrowthText(widgetSnippet(link), "widget snippet")}
        >
          {widgetSnippet(link)}
        </button>
      </details>
      {showQr ? (
        <img
          src={link.qrUrl}
          alt={`QR for ${link.name}`}
          width={qrSize}
          height={qrSize}
          className="mt-3 rounded-xl bg-white p-1 ring-1 ring-[#e5e7eb]"
        />
      ) : null}
    </>
  );
}
