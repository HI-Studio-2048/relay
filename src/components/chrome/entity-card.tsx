import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MANYCHAT, ToneChip, type ToneName } from "@/components/chrome/tone";
import { cn } from "@/lib/utils";

export function EntityCard({
  href,
  tone,
  hex,
  icon,
  label,
  title,
  subtitle,
  trailing,
  children,
  className,
}: {
  href?: string;
  tone?: ToneName;
  hex?: string;
  icon: LucideIcon;
  label?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ToneChip tone={tone} hex={hex} icon={icon} />
          {label ? (
            <span
              className="text-[11px] font-semibold tracking-wide uppercase"
              style={{ color: hex ?? (tone ? MANYCHAT[tone] : MANYCHAT.content) }}
            >
              {label}
            </span>
          ) : null}
        </div>
        {trailing}
      </div>
      <p className="mt-3 text-[13px] font-medium text-[#1b1f24]">{title}</p>
      {subtitle ? <p className="mt-1 text-[11px] leading-snug text-[#6b7280]">{subtitle}</p> : null}
      {children}
    </>
  );

  const classes = cn(
    "block rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.10)]",
    href && "transition-colors hover:bg-[#fafbfc]",
    className,
  );
  const style = { border: `1px solid ${MANYCHAT.cardBorder}` };

  if (href) {
    return (
      <Link href={href} className={classes} style={style}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={classes} style={style}>
      {inner}
    </div>
  );
}
