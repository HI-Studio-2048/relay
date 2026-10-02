"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CanvasCard } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

export type SequenceView = {
  id: string;
  botId: string;
  name: string;
  isActive: boolean;
  steps: { id: string; label: string }[];
  stats: { active: number; completed: number; unsubscribed: number };
};

/** One drip: its messages, who is in it, and pause / delete. */
export function SequenceCard({ sequence }: { sequence: SequenceView }) {
  const router = useRouter();
  const [active, setActive] = useState(sequence.isActive);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await api("/api/sequences", { method: "PATCH", body: JSON.stringify({ id: sequence.id, botId: sequence.botId, isActive: !active }) });
      setActive(!active);
      toast.success(active ? "Paused — subscribers wait where they are" : "Resumed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${sequence.name}”? ${sequence.stats.active} people are still in it.`)) return;
    setBusy(true);
    try {
      await api("/api/sequences", { method: "DELETE", body: JSON.stringify({ id: sequence.id, botId: sequence.botId, confirm: true }) });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <CanvasCard className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{sequence.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sequence.steps.length} message{sequence.steps.length === 1 ? "" : "s"} · subscribe list “{sequence.name}”
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", active ? "bg-[#ecfdf3] text-[#05603a]" : "bg-[#f4f6f8] text-[#6b7280]")}>
          {active ? "Running" : "Paused"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "In progress", value: sequence.stats.active },
          { label: "Finished", value: sequence.stats.completed },
          { label: "Opted out", value: sequence.stats.unsubscribed },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg bg-[#f9fafb] px-2 py-1.5 ring-1 ring-[#eef0f3]">
            <p className="text-[15px] font-medium tabular-nums">{tile.value}</p>
            <p className="text-[11px] text-muted-foreground">{tile.label}</p>
          </div>
        ))}
      </div>
      <ol className="space-y-1 text-sm">
        {sequence.steps.map((step, index) => (
          <li key={step.id}>
            {index + 1}. {step.label}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle()}>
          {active ? "Pause" : "Resume"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>
          Delete
        </Button>
      </div>
    </CanvasCard>
  );
}
