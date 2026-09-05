import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MANYCHAT, ToneChip } from "@/components/chrome/tone";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  hex = MANYCHAT.content,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  hex?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-14 text-center shadow-[0_1px_3px_rgba(16,24,40,0.10)]",
        className,
      )}
      style={{ border: `1px dashed ${MANYCHAT.cardBorder}` }}
    >
      <ToneChip hex={hex} icon={icon} className="size-10" />
      <div className="space-y-1">
        <p className="font-heading text-base tracking-tight text-[#1b1f24]">{title}</p>
        <p className="max-w-md text-[13px] leading-snug text-[#6b7280]">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
