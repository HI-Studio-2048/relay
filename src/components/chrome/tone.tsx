import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MANYCHAT } from "@/components/flow-canvas/node-colors";
import { cn } from "@/lib/utils";

export { MANYCHAT, NODE_TONE } from "@/components/flow-canvas/node-colors";

export type ToneName = "start" | "content" | "input" | "action" | "stop";

export function toneHex(tone?: ToneName, hex?: string) {
  return hex ?? (tone ? MANYCHAT[tone] : MANYCHAT.content);
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
      className={cn("rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10)]", className)}
      style={{ border: `1px solid ${accent ?? MANYCHAT.cardBorder}` }}
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
