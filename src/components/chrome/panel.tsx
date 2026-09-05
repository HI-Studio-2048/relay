import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CanvasCard, ToneChip, ToneLabel, type ToneName } from "@/components/chrome/tone";
import { cn } from "@/lib/utils";

export function PanelHeader({
  tone,
  icon,
  label,
  title,
  description,
  trailing,
}: {
  tone: ToneName;
  icon: LucideIcon;
  label: string;
  title?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <ToneChip tone={tone} icon={icon} />
          <ToneLabel tone={tone}>{label}</ToneLabel>
        </div>
        {title ? <p className="text-[13px] font-medium text-[#1b1f24]">{title}</p> : null}
        {description ? <p className="text-[13px] leading-snug text-[#6b7280]">{description}</p> : null}
      </div>
      {trailing}
    </div>
  );
}

export function Panel({
  tone,
  icon,
  label,
  title,
  description,
  trailing,
  children,
  className,
}: {
  tone: ToneName;
  icon: LucideIcon;
  label: string;
  title?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <CanvasCard className={cn("p-4", className)}>
      <PanelHeader
        tone={tone}
        icon={icon}
        label={label}
        title={title}
        description={description}
        trailing={trailing}
      />
      {children ? <div className="mt-3 space-y-3">{children}</div> : null}
    </CanvasCard>
  );
}
