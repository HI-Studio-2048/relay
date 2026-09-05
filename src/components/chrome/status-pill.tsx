import { MANYCHAT } from "@/components/chrome/tone";
import { cn } from "@/lib/utils";

const TONE: Record<string, { background: string; color: string }> = {
  live: { background: `${MANYCHAT.start}1a`, color: MANYCHAT.start },
  warn: { background: `${MANYCHAT.content}1a`, color: MANYCHAT.content },
  danger: { background: "#e11d481a", color: "#e11d48" },
  mute: { background: "#eef1f4", color: MANYCHAT.muted },
};

const STATUSES: Record<string, { label: string; tone: keyof typeof TONE }> = {
  connected: { label: "Live", tone: "live" },
  active: { label: "Active", tone: "live" },
  sent: { label: "Sent", tone: "live" },
  completed: { label: "Done", tone: "live" },
  awaiting_confirm: { label: "Needs confirm", tone: "warn" },
  draft: { label: "Draft", tone: "warn" },
  queued: { label: "Queued", tone: "mute" },
  sending: { label: "Sending", tone: "mute" },
  pending: { label: "Pending", tone: "mute" },
  disconnected: { label: "Offline", tone: "mute" },
  off: { label: "Off", tone: "mute" },
  error: { label: "Error", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
};

export function statusMeta(status: string) {
  return STATUSES[status] ?? { label: status.replaceAll("_", " "), tone: "mute" as const };
}

export function StatusPill({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const meta = statusMeta(status);
  const tone = TONE[meta.tone];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold capitalize",
        className,
      )}
      style={{ background: tone.background, color: tone.color }}
    >
      {label ?? meta.label}
    </span>
  );
}
