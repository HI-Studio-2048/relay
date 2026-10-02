"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CanvasCard } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import type { WeeklyDigest as Digest } from "@/lib/ai";

/** Overview card: "what happened this week, and what to do next", written by Claude on request. */
export function WeeklyDigest({ botId }: { botId: string }) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [busy, setBusy] = useState(false);

  const write = async () => {
    setBusy(true);
    try {
      const data = await api<{ digest: Digest }>(`/api/bots/${botId}/digest`, { method: "POST" });
      setDigest(data.digest);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI is unavailable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CanvasCard className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-heading text-[15px] text-[#1b1f24]">
          <Sparkles className="size-4 text-[#d946ef]" />
          Weekly digest
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void write()}>
          {busy ? "Reading your numbers…" : digest ? "Refresh" : "Write this week's digest"}
        </Button>
      </div>
      {digest ? (
        <div className="space-y-3 text-[13px]">
          <p className="font-medium text-[#1b1f24]">{digest.headline}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">What happened</p>
              <ul className="list-disc space-y-1 pl-4 text-[#374151]">
                {digest.highlights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">Do next</p>
              <ul className="list-disc space-y-1 pl-4 text-[#374151]">
                {digest.next_steps.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[#6b7280]">Claude reads this week's contacts, flows, conversions and Live Chat numbers and tells you what to do next.</p>
      )}
    </CanvasCard>
  );
}
