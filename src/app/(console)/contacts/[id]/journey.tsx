import { CircleDot, Flag, MousePointerClick, Route, Trophy, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CanvasCard } from "@/components/chrome/tone";

export type JourneyEvent = {
  at: string;
  kind: "joined" | "start" | "click" | "goal" | "complete" | "link";
  label: string;
  detail?: string | null;
};

const ICON: Record<JourneyEvent["kind"], { icon: LucideIcon; color: string }> = {
  joined: { icon: UserPlus, color: "#00C2CB" },
  link: { icon: Route, color: "#7B61FF" },
  start: { icon: Flag, color: "#0084FF" },
  click: { icon: MousePointerClick, color: "#4C6EF5" },
  goal: { icon: Trophy, color: "#16A34A" },
  complete: { icon: CircleDot, color: "#8B95A1" },
};

/** Everything that happened to one contact, newest first. */
export function Journey({ events }: { events: JourneyEvent[] }) {
  return (
    <CanvasCard className="space-y-3 p-4">
      <p className="font-heading text-[15px] text-[#1b1f24]">Journey</p>
      {events.length === 0 ? (
        <p className="text-[13px] text-[#6b7280]">Nothing yet.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-[#e5e7eb] pl-5">
          {events.map((event, index) => {
            const { icon: Icon, color } = ICON[event.kind];
            return (
              <li key={`${event.at}-${index}`} className="relative">
                <span className="absolute top-0.5 -left-[29px] flex size-5 items-center justify-center rounded-full bg-white ring-1 ring-[#e5e7eb]">
                  <Icon className="size-3" style={{ color }} />
                </span>
                <p className="text-[13px] text-[#1b1f24]">
                  {event.label}
                  {event.detail ? <span className="text-[#6b7280]"> · {event.detail}</span> : null}
                </p>
                <p className="text-[11px] text-[#8b95a1]">{new Date(event.at).toLocaleString()}</p>
              </li>
            );
          })}
        </ol>
      )}
    </CanvasCard>
  );
}
