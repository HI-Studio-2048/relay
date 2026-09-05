"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { EntityCard } from "@/components/chrome/entity-card";
import { GrowthLinkShareActions, growthLinkSubtitle } from "@/components/chrome/growth-link-share";
import { StatusPill } from "@/components/chrome/status-pill";
import { api } from "@/lib/client";
import type { GrowthLinkView } from "@/lib/growth";

export type { GrowthLinkView };

export function GrowthLinkCard({ link }: { link: GrowthLinkView }) {
  const router = useRouter();

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
      subtitle={growthLinkSubtitle(link)}
      trailing={<StatusPill status={link.startCount > 0 ? "active" : "draft"} label={link.startCount > 0 ? "Live" : "New"} />}
    >
      <GrowthLinkShareActions link={link} onDelete={() => void remove()} />
    </EntityCard>
  );
}
