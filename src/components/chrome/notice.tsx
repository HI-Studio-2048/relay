import type { ReactNode } from "react";
import { MANYCHAT } from "@/components/chrome/tone";
import { cn } from "@/lib/utils";

export function Notice({
  tone = "mute",
  children,
}: {
  tone?: "mute" | "warn" | "danger";
  children: ReactNode;
}) {
  const style =
    tone === "danger"
      ? { background: "#e11d4812", color: "#e11d48", border: "1px solid #e11d4833" }
      : tone === "warn"
        ? { background: `${MANYCHAT.content}14`, color: MANYCHAT.content, border: `1px solid ${MANYCHAT.content}33` }
        : { background: "#ffffff", color: MANYCHAT.muted, border: `1px solid ${MANYCHAT.cardBorder}` };

  return (
    <p
      className={cn("rounded-2xl px-4 py-3 text-[13px] leading-snug shadow-[0_1px_3px_rgba(16,24,40,0.06)]")}
      style={style}
    >
      {children}
    </p>
  );
}
