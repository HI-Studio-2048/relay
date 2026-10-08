export type InboxThread = {
  contactId: string;
  name: string;
  username: string | null;
  status: "open" | "closed";
  lastAt: string | null;
  lastBody: string;
  lastDirection: "inbound" | "outbound" | null;
  unread: boolean;
  tags: string[];
};

export type InboxTab = "open" | "closed" | "all";

export function filterThreads(threads: InboxThread[], input: { tab: InboxTab; query: string }): InboxThread[] {
  const query = input.query.trim().toLowerCase();
  return threads.filter((thread) => {
    if (input.tab !== "all" && thread.status !== input.tab) return false;
    if (!query) return true;
    return (
      thread.name.toLowerCase().includes(query) ||
      (thread.username ?? "").toLowerCase().includes(query) ||
      thread.lastBody.toLowerCase().includes(query) ||
      thread.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });
}

/** Next thread after `currentId` in the visible list, wrapping to the first; null when alone. */
export function nextThreadId(visible: InboxThread[], currentId: string | null, step: 1 | -1 = 1): string | null {
  if (visible.length === 0) return null;
  const index = visible.findIndex((thread) => thread.contactId === currentId);
  if (index === -1) return visible[0]!.contactId;
  const next = visible[(index + step + visible.length) % visible.length]!;
  return next.contactId === currentId ? null : next.contactId;
}

export function initials(name: string): string {
  const parts = name.replace(/^@/, "").split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]!.toUpperCase());
  return letters.join("") || "?";
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
