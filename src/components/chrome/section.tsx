import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
