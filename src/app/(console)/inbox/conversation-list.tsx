"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, Bell, BellOff, Search } from "lucide-react";
import { useBot } from "@/components/bot-provider";
import { ContactAvatar } from "@/components/chrome/avatar";
import { PlatformBadge, zernioPlatformLabel } from "@/components/chrome/platform-badge";
import { useTeam } from "@/components/use-team";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Thread = {
  contactId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  platform: string | null;
  status: "open" | "closed" | "snoozed";
  snoozedUntil: string | null;
  lastAt: string | null;
  lastBody: string;
  lastDirection: "inbound" | "outbound";
  needsReply: boolean;
  assignedTo: string | null;
  tags: string[];
};

type Filter = "open" | "unanswered" | "mine" | "unassigned" | "snoozed" | "closed" | "all";

const FILTERS: { value: Filter; label: string; team?: boolean }[] = [
  { value: "open", label: "Open" },
  { value: "unanswered", label: "Needs reply" },
  { value: "mine", label: "Mine", team: true },
  { value: "unassigned", label: "Unassigned", team: true },
  { value: "snoozed", label: "Snoozed" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const NOTIFY_KEY = "relay.inbox.notify";

function readNotifyPref() {
  try {
    return localStorage.getItem(NOTIFY_KEY) === "on" && typeof Notification !== "undefined" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

/** Threads whose newest message is a fresh inbound one since the previous poll. */
function freshInbound(previous: Map<string, string | null>, threads: Thread[]) {
  return threads.filter(
    (thread) =>
      thread.lastDirection === "inbound" &&
      thread.lastAt &&
      (previous.get(thread.contactId) ?? "") < thread.lastAt,
  );
}

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
  const [tagFilter, setTagFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const allPlatforms = useMemo(
    () => [...new Set((threads ?? []).map((thread) => thread.platform).filter((value): value is string => Boolean(value)))].sort(),
    [threads],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A new filter, tag or search starts a fresh selection, so bulk actions never touch hidden chats.
  const viewKey = `${filter}|${tagFilter}|${platformFilter}|${query}`;
  const [selectionKey, setSelectionKey] = useState(viewKey);
  if (selectionKey !== viewKey) {
    setSelectionKey(viewKey);
    setSelected(new Set());
  }

  const bulk = async (action: "done" | "assign", memberId?: string | null) => {
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        action === "done"
          ? api(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ inboxStatus: "closed" }) })
          : api(`/api/inbox/${id}/assign`, { method: "POST", body: JSON.stringify({ memberId: memberId ?? null }) }),
      ),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    const done = new Set(ids.filter((_, index) => results[index]!.status === "fulfilled"));
    if (failed) toast.error(`${failed} of ${ids.length} could not be updated`);
    else toast.success(action === "done" ? `Marked ${ids.length} done` : `Assigned ${ids.length}`);
    setSelected(new Set());
    setBulkBusy(false);
    setThreads((current) =>
      (current ?? []).map((thread) =>
        !done.has(thread.contactId)
          ? thread
          : action === "done"
            ? { ...thread, status: "closed", needsReply: false }
            : { ...thread, assignedTo: memberId ?? null },
      ),
    );
  };
  const allTags = useMemo(() => [...new Set((threads ?? []).flatMap((thread) => thread.tags ?? []))].sort((a, b) => a.localeCompare(b)), [threads]);
  const { team, me, setMe, byId } = useTeam();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const seen = useRef<Map<string, string | null> | null>(null);
  const [notify, setNotify] = useState(false);
  const notifyRef = useRef(false);
  const activeRef = useRef(activeId);
  useEffect(() => {
    notifyRef.current = notify;
    activeRef.current = activeId;
  }, [notify, activeId]);

  useEffect(() => {
    const timer = setTimeout(() => setNotify(readNotifyPref()), 0);
    return () => clearTimeout(timer);
  }, []);

  async function toggleNotify() {
    if (typeof Notification === "undefined") return;
    let next = !notify;
    if (next && Notification.permission !== "granted") next = (await Notification.requestPermission()) === "granted";
    setNotify(next);
    try {
      localStorage.setItem(NOTIFY_KEY, next ? "on" : "off");
    } catch {}
  }

  useEffect(() => {
    if (!botId) return;
    let cancelled = false;
    const load = () =>
      api<{ threads: Thread[] }>(`/api/inbox?botId=${botId}`)
        .then((data) => {
          if (cancelled) return;
          const previous = seen.current;
          seen.current = new Map(data.threads.map((thread) => [thread.contactId, thread.lastAt]));
          setThreads(data.threads);
          if (!previous) return;
          const fresh = freshInbound(previous, data.threads).filter(
            (thread) => document.hidden || thread.contactId !== activeRef.current,
          );
          if (!notifyRef.current || typeof Notification === "undefined") return;
          for (const thread of fresh.slice(0, 3)) {
            const note = new Notification(thread.name, { body: thread.lastBody, tag: thread.contactId, icon: "/icon.svg" });
            note.onclick = () => {
              window.focus();
              router.push(`/inbox/${thread.contactId}`);
              note.close();
            };
          }
        })
        .catch(() => undefined);
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [botId, router]);

  const counts = useMemo(() => {
    const list = threads ?? [];
    return {
      open: list.filter((thread) => thread.status === "open").length,
      unanswered: list.filter((thread) => thread.needsReply).length,
      mine: list.filter((thread) => thread.status === "open" && me && thread.assignedTo === me).length,
      unassigned: list.filter((thread) => thread.status === "open" && !thread.assignedTo).length,
      snoozed: list.filter((thread) => thread.status === "snoozed").length,
      closed: list.filter((thread) => thread.status === "closed").length,
      all: list.length,
    };
  }, [threads, me]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (threads ?? []).filter((thread) => {
      if (filter === "open" && thread.status !== "open") return false;
      if (filter === "closed" && thread.status !== "closed") return false;
      if (filter === "snoozed" && thread.status !== "snoozed") return false;
      if (tagFilter && !(thread.tags ?? []).includes(tagFilter)) return false;
      if (platformFilter && thread.platform !== platformFilter) return false;
      if (filter === "unanswered" && !thread.needsReply) return false;
      if (filter === "mine" && !(thread.status === "open" && me && thread.assignedTo === me)) return false;
      if (filter === "unassigned" && !(thread.status === "open" && !thread.assignedTo)) return false;
      if (!needle) return true;
      return (
        thread.name.toLowerCase().includes(needle) ||
        (thread.username ?? "").toLowerCase().includes(needle) ||
        thread.lastBody.toLowerCase().includes(needle)
      );
    });
  }, [threads, filter, query, me, tagFilter, platformFilter]);

  useEffect(() => {
    const waiting = counts.unanswered;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = waiting > 0 ? `(${waiting}) ${base}` : base;
  }, [counts.unanswered]);

  // Keyboard: j/k move through conversations, / searches.
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key !== "j" && event.key !== "k") return;
      const list = visibleRef.current;
      if (list.length === 0) return;
      const index = list.findIndex((thread) => thread.contactId === activeRef.current);
      const nextIndex = index === -1 ? 0 : Math.max(0, Math.min(list.length - 1, index + (event.key === "j" ? 1 : -1)));
      router.push(`/inbox/${list[nextIndex]!.contactId}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col border-r border-[#e5e7eb] bg-white md:w-80",
        activeId ? "hidden md:flex" : "flex",
      )}
    >
      <div className="space-y-2.5 border-b border-[#e5e7eb] p-3">
        {team.length > 0 ? (
          <label className="flex items-center gap-2 text-[12px] text-[#6b7280]">
            You are
            <select
              aria-label="You are"
              value={me ?? ""}
              onChange={(event) => setMe(event.target.value || null)}
              className="flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-[12px] text-[#1b1f24]"
            >
              <option value="">Pick your name…</option>
              {team.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex items-center gap-2 rounded-xl bg-[#f4f6f8] px-2.5 py-1.5">
          <Search className="size-3.5 text-[#8b95a1]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people and messages  /"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#8b95a1]"
          />
          <button
            type="button"
            onClick={() => void toggleNotify()}
            title={notify ? "Desktop notifications on" : "Get desktop notifications for new messages"}
            aria-label="Toggle desktop notifications"
            className={cn("shrink-0 rounded-md p-0.5", notify ? "text-[#0084ff]" : "text-[#8b95a1] hover:text-[#1b1f24]")}
          >
            {notify ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
          </button>
        </div>
        {allTags.length > 0 || allPlatforms.length > 1 ? (
          <div className="flex gap-2">
            {allPlatforms.length > 1 ? (
              <select
                aria-label="Filter by network"
                value={platformFilter}
                onChange={(event) => setPlatformFilter(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-[12px] text-[#1b1f24]"
              >
                <option value="">All networks</option>
                {allPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {zernioPlatformLabel(platform)}
                  </option>
                ))}
              </select>
            ) : null}
            {allTags.length > 0 ? (
              <select
                aria-label="Filter by tag"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-[12px] text-[#1b1f24]"
              >
                <option value="">Any tag</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.filter((item) => !item.team || team.length > 0).map((item) => (
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
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e7eb] bg-[#eef6ff] px-3 py-2 text-[12px]">
          <span className="font-medium text-[#0b63c5]">{selected.size} selected</span>
          <button type="button" disabled={bulkBusy} onClick={() => void bulk("done")} className="rounded-md bg-white px-2 py-1 ring-1 ring-[#e5e7eb] hover:bg-[#f9fafb]">
            Mark done
          </button>
          {team.length > 0 ? (
            <select
              aria-label="Assign selected"
              value=""
              disabled={bulkBusy}
              onChange={(event) => void bulk("assign", event.target.value === "none" ? null : event.target.value)}
              className="rounded-md bg-white px-1.5 py-1 ring-1 ring-[#e5e7eb]"
            >
              <option value="">Assign to…</option>
              <option value="none">Unassigned</option>
              {team.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[#6b7280] hover:text-[#1b1f24]">
            Clear
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {threads === null ? (
          <p className="p-4 text-[13px] text-[#6b7280]">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-[13px] text-[#6b7280]">
            {threads.length === 0 ? "No conversations yet. New messages and comments land here." : "Nothing matches."}
          </p>
        ) : (
          visible.map((thread) => (
            <div key={thread.contactId} className="group relative">
            <input
              type="checkbox"
              aria-label={`Select ${thread.name}`}
              checked={selected.has(thread.contactId)}
              onChange={() => toggleSelected(thread.contactId)}
              className={cn(
                "absolute top-3 left-1 z-10 size-3.5 accent-[#0084ff]",
                selected.size > 0 ? "block" : "hidden group-hover:block",
              )}
            />
            <Link
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
                <div className="mt-1 flex items-center gap-1.5">
                  {thread.platform ? <PlatformBadge platform={thread.platform} /> : null}
                  {(thread.tags ?? []).slice(0, 2).map((tag) => (
                    <span key={tag} className="max-w-20 truncate rounded-full bg-[#f5f3ff] px-1.5 py-0.5 text-[10px] text-[#6d28d9]">
                      #{tag}
                    </span>
                  ))}
                  {thread.snoozedUntil ? (
                    <span className="flex items-center gap-0.5 rounded-full bg-[#f5f3ff] px-1.5 py-0.5 text-[10px] font-medium text-[#6d28d9]">
                      <AlarmClock className="size-2.5" />
                      {new Date(thread.snoozedUntil).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
                    </span>
                  ) : null}
                  {byId(thread.assignedTo) ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ background: byId(thread.assignedTo)!.color }}
                      title={`Assigned to ${byId(thread.assignedTo)!.name}`}
                    >
                      {byId(thread.assignedTo)!.name.split(" ")[0]}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
