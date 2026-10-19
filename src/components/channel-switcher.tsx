"use client";

import { usePathname } from "next/navigation";
import { CHANNELS } from "@/lib/channels/types";
import { ALL_CHANNELS, isAggregatePath } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { useBot } from "@/components/bot-provider";

/**
 * What the switcher shows on the current page. Overview and Live Chat can show All channels.
 * Every other page shows, and switches, the one account it reads and saves to (`bot`, which
 * comes from the same `resolveScope` the server pages use).
 */
export function useChannelView() {
  const pathname = usePathname();
  const { bots, bot, aggregate } = useBot();
  const canMerge = isAggregatePath(pathname);
  // The flow editor belongs to the flow's account (`PinnedBot` moves the switcher there), so
  // picking another account on it would only be undone.
  const pinned = /^\/flows\/[^/]+$/.test(pathname);
  return { bots, bot, canMerge, pinned, showingAll: canMerge && aggregate };
}

export function ChannelSwitcher({
  className,
  compact = false,
  full = false,
  label,
}: {
  className?: string;
  compact?: boolean;
  full?: boolean;
  /** Visible label. Defaults to Showing on Overview and Live Chat, Account elsewhere. */
  label?: string;
}) {
  const { setBotId } = useBot();
  const { bots, bot, canMerge, pinned, showingAll } = useChannelView();
  if (bots.length === 0 || pinned) return null;
  if (!canMerge && !bot) return null;
  const text = label ?? (canMerge ? "Showing" : "Account");
  return (
    <label className={cn("flex min-w-0 items-center gap-2", className)}>
      {compact ? null : (
        <span className="shrink-0 text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">{text}</span>
      )}
      <select
        aria-label={text}
        className={cn(
          "min-w-0 max-w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#1b1f24]",
          full && "w-full flex-1",
        )}
        value={showingAll ? ALL_CHANNELS : (bot?.id ?? ALL_CHANNELS)}
        onChange={(event) => setBotId(event.target.value, { keepView: !canMerge })}
      >
        {canMerge ? <option value={ALL_CHANNELS}>All channels</option> : null}
        {bots.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {CHANNELS[item.channel ?? "telegram"].label}
          </option>
        ))}
      </select>
    </label>
  );
}
