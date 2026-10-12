"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { useBot } from "@/components/bot-provider";
import { CanvasCard } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { CHANNEL_CATALOG, type CatalogEntry } from "@/lib/channels/catalog";
import { CHANNELS } from "@/lib/channels/types";
import { cn } from "@/lib/utils";

type Notice = { tone: "ok" | "error"; text: string } | null;

function Mark({ entry, size = "md" }: { entry: Pick<CatalogEntry, "mark" | "color">; size?: "md" | "sm" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-semibold text-white",
        size === "md" ? "size-10 text-[13px]" : "size-8 text-[11px]",
      )}
      style={{ background: entry.color }}
    >
      {entry.mark}
    </span>
  );
}

function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
        notice.tone === "ok" ? "bg-[#ecfdf3] text-[#067647]" : "bg-[#fef3f2] text-[#b42318]",
      )}
    >
      {notice.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
      {notice.text}
    </p>
  );
}

function statusChip(status: string) {
  if (status === "connected") return { text: "Live", className: "bg-[#ecfdf3] text-[#067647]" };
  if (status === "error") return { text: "Needs attention", className: "bg-[#fef3f2] text-[#b42318]" };
  return { text: "Not connected", className: "bg-[#fffaeb] text-[#b54708]" };
}

/** Every channel Recatch has or is building. Connectable ones open Setup, the rest are greyed out. */
export function ChannelsManager({ notice }: { notice: Notice }) {
  const router = useRouter();
  const { bots, bot, setBotId } = useBot();

  const counts = new Map<string, number>();
  for (const item of bots) counts.set(item.channel, (counts.get(item.channel) ?? 0) + 1);
  const ready = CHANNEL_CATALOG.filter((entry) => entry.state !== "soon");
  const soon = CHANNEL_CATALOG.filter((entry) => entry.state === "soon");

  const manage = (id: string) => {
    setBotId(id);
    router.push("/setup");
  };

  return (
    <div className="space-y-5">
      <NoticeBar notice={notice} />

      <CanvasCard className="space-y-3 p-4">
        <div>
          <p className="font-heading text-[15px] text-[#1b1f24]">Connected accounts</p>
          <p className="text-[12px] text-[#6b7280]">
            {bots.length === 0
              ? "Nothing connected yet. Pick a channel below."
              : `${bots.length} account${bots.length === 1 ? "" : "s"}. Each one has its own inbox, contacts and flows.`}
          </p>
        </div>
        {bots.length ? (
          <ul className="divide-y divide-[#f0f2f4]">
            {bots.map((item) => {
              const chip = statusChip(item.status);
              const meta = CHANNELS[item.channel];
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#1b1f24]">{item.name}</p>
                    <p className="text-[12px] text-[#6b7280]">
                      {meta.label}
                      {item.id === bot?.id ? " · working in this one" : ""}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", chip.className)}>{chip.text}</span>
                  <Button size="sm" variant="outline" onClick={() => manage(item.id)}>
                    Manage
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CanvasCard>

      <div className="space-y-2">
        <p className="font-heading text-[15px] text-[#1b1f24]">Connect a channel</p>
        <p className="text-[13px] text-[#6b7280]">You sign in on the platform&apos;s own screen, or paste a token where the platform has no sign-in for apps. Nothing is posted for you.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ready.map((entry) => {
            const connected = entry.channel ? (counts.get(entry.channel) ?? 0) : 0;
            return (
              <CanvasCard key={entry.id} className="flex items-center gap-3 p-3">
                <Mark entry={entry} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#1b1f24]">
                    {entry.label}
                    {connected ? <span className="ml-1.5 text-[11px] font-normal text-[#067647]">{connected} connected</span> : null}
                  </p>
                  <p className="text-[12px] leading-snug text-[#6b7280]">{entry.what}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#8b95a1]">{entry.how}</p>
                </div>
                <Button
                  size="sm"
                  variant={connected ? "outline" : "default"}
                  nativeButton={false}
                  render={<Link href={`/setup?channel=${entry.channel}`} />}
                >
                  {connected ? "Add another" : "Connect"}
                </Button>
              </CanvasCard>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-heading text-[15px] text-[#1b1f24]">On the way</p>
        <p className="text-[13px] text-[#6b7280]">Not built yet, or waiting on the platform. They turn on here as each one lands.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {soon.map((entry) => (
            <CanvasCard key={entry.id} className="flex items-center gap-3 p-3 opacity-55 grayscale" aria-disabled>
              <Mark entry={entry} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[#1b1f24]">{entry.label}</p>
                <p className="text-[12px] leading-snug text-[#6b7280]">{entry.what}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#8b95a1]">{entry.how}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#f0f2f4] px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">Soon</span>
            </CanvasCard>
          ))}
        </div>
      </div>
    </div>
  );
}
