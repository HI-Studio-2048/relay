import Link from "next/link";
import type { ReactNode } from "react";
import { MANYCHAT } from "@/components/chrome/tone";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ListPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10)]", className)}
      style={{ border: `1px solid ${MANYCHAT.cardBorder}` }}
    >
      <div className="divide-y" style={{ borderColor: MANYCHAT.cardBorder }}>
        {children}
      </div>
    </div>
  );
}

export function AvatarMark({
  name,
  hex = MANYCHAT.content,
  className,
}: {
  name: string;
  hex?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide text-white",
        className,
      )}
      style={{ background: hex }}
    >
      {initials(name)}
    </span>
  );
}

export function ListRow({
  href,
  title,
  subtitle,
  meta,
  trailing,
  leading,
  selected,
  className,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  selected?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#f4f6f8]",
        selected && "bg-[#f4f6f8]",
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{title}</p>
        {subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {meta ? <div className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">{meta}</div> : null}
      {trailing}
    </Link>
  );
}
