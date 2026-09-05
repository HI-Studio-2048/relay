"use client";

import { toast } from "sonner";
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

export function growthLinkSubtitle(link: GrowthLinkView) {
  return `/start ${link.slug} · ${link.clickCount} click${link.clickCount === 1 ? "" : "s"} · ${link.startCount} start${link.startCount === 1 ? "" : "s"}${link.tagName ? ` · tag ${link.tagName}` : ""}${link.flowName ? ` · ${link.flowName}` : ""}`;
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
      {link.telegramUrl ? (
        <p className="mt-0.5 break-all text-[12px] text-[#6b7280]">{link.telegramUrl}</p>
      ) : (
        <p className="mt-0.5 text-[12px] text-[#6b7280]">Connect a bot username to get a t.me start link.</p>
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
        {link.telegramUrl ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-[#1b1f24]"
            onClick={() => void copyGrowthText(link.telegramUrl!, "t.me start link")}
          >
            Copy t.me
          </Button>
        ) : null}
        {onDelete ? (
          <Button size="sm" variant="ghost" className="text-[#1b1f24]" onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
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
