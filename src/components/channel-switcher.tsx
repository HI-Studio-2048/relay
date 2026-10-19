"use client";

import { CHANNELS } from "@/lib/channels/types";
import { ALL_CHANNELS } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { useBot } from "@/components/bot-provider";

/** Explicit All-channels control. A stored account cookie does not change this. */
export function ChannelSwitcher({ className, compact = false, full = false }: { className?: string; compact?: boolean; full?: boolean }) {
  const { bots, bot, aggregate, setBotId } = useBot();
  if (bots.length === 0) return null;
  return (
    <label className={cn("flex min-w-0 items-center gap-2", className)}>
      {compact ? null : (
        <span className="shrink-0 text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">Showing</span>
      )}
      <select
        aria-label="Showing"
        className={cn(
          "min-w-0 max-w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#1b1f24]",
          full && "w-full flex-1",
        )}
        value={aggregate ? ALL_CHANNELS : (bot?.id ?? ALL_CHANNELS)}
        onChange={(event) => setBotId(event.target.value)}
      >
        <option value={ALL_CHANNELS}>All channels</option>
        {bots.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {CHANNELS[item.channel ?? "telegram"].label}
          </option>
        ))}
      </select>
    </label>
  );
}
