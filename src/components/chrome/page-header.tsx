import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ToneChip, type ToneName } from "@/components/chrome/tone";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
  tone,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  tone?: ToneName;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex items-center gap-2.5">
          {icon ? <ToneChip tone={tone} icon={icon} className="size-8" /> : null}
          <h1 className="truncate font-heading text-xl tracking-tight text-[#1b1f24]">{title}</h1>
        </div>
        {description ? (
          <p className="max-w-2xl text-[13px] leading-snug text-[#6b7280]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
