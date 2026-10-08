"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { CHANNELS, type ChannelId } from "@/lib/channels/types";
import { api } from "@/lib/client";
import { filterThreads, initials, nextThreadId, relativeTime, type InboxTab, type InboxThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";

type InboxContextValue = {
  threads: InboxThread[];
  visible: InboxThread[];
  refresh: () => Promise<void>;
  /** Jump to the neighbouring thread in the visible list. Returns false when there is none. */
  goTo: (step: 1 | -1) => boolean;
  channel: ChannelId;
};

const InboxContext = createContext<InboxContextValue | null>(null);

export function useInbox() {
  const value = useContext(InboxContext);
  if (!value) throw new Error("useInbox must be used inside InboxShell");
  return value;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * ManyChat-style Live Chat: conversations down the left, the open thread on the right.
 * ↑/↓ or j/k move between conversations without touching the mouse.
 */
export function InboxShell({
  botId,
  channel,
  initialThreads,
  children,
}: {
  botId: string;
  channel: ChannelId;
  initialThreads: InboxThread[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [tab, setTab] = useState<InboxTab>("open");
  const [query, setQuery] = useState("");
  const selectedId = pathname.startsWith("/inbox/") ? pathname.slice("/inbox/".length).split("/")[0] || null : null;

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ threads: InboxThread[] }>(`/api/inbox?botId=${botId}`);
      setThreads(data.threads);
    } catch {
      // keep the last good list
    }
  }, [botId]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const visible = useMemo(() => {
    // Opening a thread marks it read on the server; show that immediately without waiting for the poll.
    const seen = threads.map((thread) => (thread.contactId === selectedId ? { ...thread, unread: false } : thread));
    const filtered = filterThreads(seen, { tab, query });
    // Keep the open thread in the list even if it just changed status, so keyboard navigation stays anchored.
    if (selectedId && !filtered.some((thread) => thread.contactId === selectedId)) {
      const current = seen.find((thread) => thread.contactId === selectedId);
      if (current) return [current, ...filtered];
    }
    return filtered;
  }, [threads, tab, query, selectedId]);

  const goTo = useCallback(
    (step: 1 | -1) => {
      const next = nextThreadId(visible, selectedId, step);
      if (!next) return false;
      router.push(`/inbox/${next}`);
      return true;
    },
    [visible, selectedId, router],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        goTo(1);
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        goTo(-1);
      } else if (event.key === "/") {
        event.preventDefault();
        document.getElementById("inbox-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const unreadOpen = threads.filter((thread) => thread.unread && thread.status === "open").length;
  const counts = {
    open: threads.filter((thread) => thread.status === "open").length,
    closed: threads.filter((thread) => thread.status === "closed").length,
    all: threads.length,
  };

  const value = useMemo(() => ({ threads, visible, refresh, goTo, channel }), [threads, visible, refresh, goTo, channel]);

  return (
    <InboxContext.Provider value={value}>
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "flex w-full shrink-0 flex-col border-r border-[#e5e7eb] bg-white lg:w-[340px]",
            selectedId ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="space-y-2 border-b border-[#e5e7eb] px-3 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <h1 className="font-heading text-lg tracking-tight">Inbox</h1>
              <span className="flex items-center gap-1.5 text-[11px] text-[#6b7280]">
                <span className="inline-block size-2 rounded-full" style={{ background: CHANNELS[channel].color }} />
                {CHANNELS[channel].label}
                {unreadOpen > 0 ? ` · ${unreadOpen} unread` : ""}
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#8b95a1]" />
              <Input
                id="inbox-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, tag, or message  ( / )"
                className="pl-8"
              />
            </div>
            <div className="flex gap-1 rounded-lg bg-[#f4f6f8] p-0.5">
              {(["open", "closed", "all"] as InboxTab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize",
                    tab === item ? "bg-white text-[#1b1f24] shadow-sm" : "text-[#6b7280]",
                  )}
                >
                  {item} <span className="tabular-nums opacity-60">{counts[item]}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <li className="px-4 py-6 text-sm text-[#6b7280]">
                {threads.length === 0 ? "No conversations yet. When someone messages you, it shows up here." : "Nothing matches."}
              </li>
            ) : (
              visible.map((thread) => {
                const active = thread.contactId === selectedId;
                return (
                  <li key={thread.contactId}>
                    <button
                      type="button"
                      onClick={() => router.push(`/inbox/${thread.contactId}`)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-[#f0f2f4] px-3 py-2.5 text-left hover:bg-[#f7f8fa]",
                        active && "bg-[#eaf3ff] hover:bg-[#eaf3ff]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          active ? "bg-[#0084ff] text-white" : "bg-[#eef1f4] text-[#1b1f24]",
                        )}
                      >
                        {initials(thread.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-[13px]", thread.unread ? "font-semibold text-[#1b1f24]" : "font-medium text-[#1b1f24]")}>
                            {thread.name}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-[#8b95a1]">{relativeTime(thread.lastAt)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className={cn("min-w-0 flex-1 truncate text-xs", thread.unread ? "text-[#1b1f24]" : "text-[#6b7280]")}>
                            {thread.lastDirection === "outbound" ? "You: " : ""}
                            {thread.lastBody || "…"}
                          </span>
                          {thread.unread ? <span className="size-2 shrink-0 rounded-full bg-[#0084ff]" /> : null}
                          {thread.status === "closed" ? (
                            <span className="shrink-0 rounded bg-[#eef1f4] px-1 text-[10px] uppercase text-[#6b7280]">closed</span>
                          ) : null}
                        </span>
                        {thread.tags.length > 0 ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {thread.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="rounded-full bg-[#f4f6f8] px-1.5 py-px text-[10px] text-[#6b7280]">
                                #{tag}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <p className="border-t border-[#e5e7eb] px-3 py-1.5 text-[10px] text-[#8b95a1]">
            ↑ ↓ or j k to move · / to search · Enter sends, Shift+Enter for a new line
          </p>
        </aside>

        <section className={cn("min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden lg:flex")}>{children}</section>
      </div>
    </InboxContext.Provider>
  );
}
