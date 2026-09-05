"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { EntityCard } from "@/components/chrome/entity-card";
import { StatusPill } from "@/components/chrome/status-pill";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";

export type GrowthLinkView = {
  id: string;
  name: string;
  slug: string;
  tagName: string | null;
  flowId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  clickCount: number;
  startCount: number;
  telegramUrl: string | null;
  shortUrl: string;
  qrUrl: string;
  flowName?: string | null;
};

export function GrowthLinkCard({ link }: { link: GrowthLinkView }) {
  const router = useRouter();

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${label}`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this growth link? Existing start params will stop attributing.")) return;
    try {
      await api(`/api/growth-links/${link.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      router.refresh();
      toast.success("Link deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  };

  return (
    <EntityCard
      tone="action"
      icon={Link2}
      label="Growth link"
      title={link.name}
      subtitle={`/start ${link.slug} · ${link.clickCount} click${link.clickCount === 1 ? "" : "s"} · ${link.startCount} start${link.startCount === 1 ? "" : "s"}${link.tagName ? ` · tag ${link.tagName}` : ""}${link.flowName ? ` · ${link.flowName}` : ""}`}
      trailing={<StatusPill status={link.startCount > 0 ? "active" : "draft"} label={link.startCount > 0 ? "Live" : "New"} />}
    >
      {link.utmSource || link.utmMedium || link.utmCampaign ? (
        <p className="mt-1 text-[11px] text-[#6b7280]">
          {[link.utmSource, link.utmMedium, link.utmCampaign].filter(Boolean).join(" / ")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy(link.shortUrl, "short link")}>
          Copy short link
        </Button>
        {link.telegramUrl ? (
          <Button size="sm" variant="ghost" onClick={() => void copy(link.telegramUrl!, "Telegram link")}>
            Copy t.me
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void remove()}>
          Delete
        </Button>
      </div>
      <img
        src={link.qrUrl}
        alt={`QR for ${link.name}`}
        width={180}
        height={180}
        className="mt-3 rounded-xl bg-white p-1 ring-1 ring-[#e5e7eb]"
      />
    </EntityCard>
  );
}
