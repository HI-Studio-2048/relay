"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useBot } from "@/components/bot-provider";
import { ContactAvatar } from "@/components/chrome/avatar";
import { PlatformBadge } from "@/components/chrome/platform-badge";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

type Thread = {
  contactId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  platform: string | null;
  status: "open" | "closed";
  lastAt: string | null;
  lastBody: string;
  lastDirection: "inbound" | "outbound";
  needsReply: boolean;
};

type Filter = "open" | "unanswered" | "closed" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "unanswered", label: "Needs reply" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

function relativeTime(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export function ConversationList() {
  const { botId } = useBot();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/inbox/") ? pathname.split("/")[2] : null;
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!botId) return;
    let cancelled = false;
    const load = () =>
      api<{ threads: Thread[] }>(`/api/inbox?botId=${botId}`)
        .then((data) => {
          if (!cancelled) setThreads(data.threads);
        })
        .catch(() => undefined);
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [botId]);

  const counts = useMemo(() => {
    const list = threads ?? [];
    return {
      open: list.filter((thread) => thread.status === "open").length,
      unanswered: list.filter((thread) => thread.needsReply).length,
      closed: list.filter((thread) => thread.status === "closed").length,
      all: list.length,
    };
  }, [threads]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (threads ?? []).filter((thread) => {
      if (filter === "open" && thread.status !== "open") return false;
      if (filter === "closed" && thread.status !== "closed") return false;
      if (filter === "unanswered" && !thread.needsReply) return false;
      if (!needle) return true;
      return (
        thread.name.toLowerCase().includes(needle) ||
        (thread.username ?? "").toLowerCase().includes(needle) ||
        thread.lastBody.toLowerCase().includes(needle)
      );
    });
  }, [threads, filter, query]);

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col border-r border-[#e5e7eb] bg-white md:w-80",
        activeId ? "hidden md:flex" : "flex",
      )}
    >
      <div className="space-y-2.5 border-b border-[#e5e7eb] p-3">
        <div className="flex items-center gap-2 rounded-xl bg-[#f4f6f8] px-2.5 py-1.5">
          <Search className="size-3.5 text-[#8b95a1]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people and messages"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#8b95a1]"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium",
                filter === item.value ? "bg-[#1b1f24] text-white" : "text-[#6b7280] hover:bg-[#f4f6f8]",
              )}
            >
              {item.label}
              <span className="tabular-nums opacity-70">{counts[item.value]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {threads === null ? (
          <p className="p-4 text-[13px] text-[#6b7280]">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-[13px] text-[#6b7280]">
            {threads.length === 0 ? "No conversations yet. New messages and comments land here." : "Nothing matches."}
          </p>
        ) : (
          visible.map((thread) => (
            <Link
              key={thread.contactId}
              href={`/inbox/${thread.contactId}`}
              className={cn(
                "flex gap-3 border-b border-[#f0f2f4] px-3 py-2.5 hover:bg-[#f7f9fb]",
                activeId === thread.contactId && "bg-[#eef6ff] hover:bg-[#eef6ff]",
              )}
            >
              <ContactAvatar name={thread.name} src={thread.avatarUrl} platform={thread.platform} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-[13px] text-[#1b1f24]", thread.needsReply ? "font-semibold" : "font-medium")}>
                    {thread.name}
                  </p>
                  <span className="shrink-0 text-[11px] text-[#8b95a1]">{relativeTime(thread.lastAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <p className={cn("min-w-0 flex-1 truncate text-[12px]", thread.needsReply ? "text-[#1b1f24]" : "text-[#6b7280]")}>
                    {thread.lastDirection === "outbound" ? "You: " : ""}
                    {thread.lastBody}
                  </p>
                  {thread.needsReply ? <span className="size-2 shrink-0 rounded-full bg-[#0084ff]" /> : null}
                </div>
                {thread.platform ? <PlatformBadge platform={thread.platform} className="mt-1" /> : null}
              </div>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}
