import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NODE_TONE } from "@/components/flow-canvas/node-colors";
import { RELAY, RELAY_SHADOW, themeHex, type ThemeTone } from "@/lib/theme";
import { cn } from "@/lib/utils";

export { MANYCHAT, RELAY, RELAY_CSS_VARS, RELAY_RADIUS, RELAY_SHADOW, relayVar } from "@/lib/theme";
export { NODE_TONE };

export type ToneName = ThemeTone;

export function toneHex(tone?: ToneName, hex?: string) {
  return themeHex(tone, hex);
}

export function ToneChip({
  tone,
  hex,
  icon: Icon,
  className,
}: {
  tone?: ToneName;
  hex?: string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-white", className)}
      style={{ background: toneHex(tone, hex) }}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

export function CanvasCard({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl bg-white", className)}
      style={{
        border: `1px solid ${accent ?? RELAY.cardBorder}`,
        boxShadow: RELAY_SHADOW,
      }}
    >
      {children}
    </div>
  );
}

export function ToneLabel({
  tone,
  hex,
  children,
}: {
  tone?: ToneName;
  hex?: string;
  children: ReactNode;
}) {
  return (
    <span
      className="text-[11px] font-semibold tracking-wide uppercase"
      style={{ color: toneHex(tone, hex) }}
    >
      {children}
    </span>
  );
}
