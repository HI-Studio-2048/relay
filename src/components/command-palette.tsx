"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Search, User, Workflow } from "lucide-react";
import { useBot } from "@/components/bot-provider";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

type Item = { id: string; label: string; detail?: string; href: string; kind: "page" | "flow" | "contact" };

const PAGES: Omit<Item, "kind" | "id">[] = [
  { label: "Overview", href: "/" },
  { label: "Inbox (Live Chat)", href: "/inbox" },
  { label: "Contacts", href: "/contacts" },
  { label: "Flows", href: "/flows" },
  { label: "Keywords", href: "/keywords" },
  { label: "Starters & hours", href: "/starters" },
  { label: "Sequences", href: "/sequences" },
  { label: "Rules", href: "/rules" },
  { label: "Broadcasts", href: "/broadcasts" },
  { label: "New broadcast", href: "/broadcasts/new" },
  { label: "AI assistant", href: "/ai" },
  { label: "Growth links", href: "/growth" },
  { label: "API & webhooks", href: "/integrations" },
  { label: "Settings & team", href: "/setup" },
];

const ICONS = { page: Search, flow: Workflow, contact: User } as const;

/** ⌘K / Ctrl+K: jump to any page, flow or contact. */
export function CommandPalette() {
  const { botId } = useBot();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("relay:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("relay:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !botId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setRemote([]);
        return;
      }
      api<{ flows: { id: string; name: string; isActive: boolean }[]; contacts: { id: string; name: string; detail: string }[] }>(
        `/api/search?botId=${botId}&q=${encodeURIComponent(query)}`,
      )
        .then((data) => {
          if (cancelled) return;
          setRemote([
            ...data.flows.map((flow) => ({ id: flow.id, label: flow.name, detail: flow.isActive ? "Flow · on" : "Flow · off", href: `/flows/${flow.id}`, kind: "flow" as const })),
            ...data.contacts.map((contact) => ({ id: contact.id, label: contact.name, detail: contact.detail, href: `/inbox/${contact.id}`, kind: "contact" as const })),
          ]);
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, botId]);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pages = PAGES.filter((page) => !needle || page.label.toLowerCase().includes(needle)).map((page) => ({ ...page, id: page.href, kind: "page" as const }));
    return [...remote, ...pages].slice(0, 14);
  }, [query, remote]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    setQuery("");
    router.push(item.href);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Search Relay"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#e5e7eb] px-4 py-3">
          <Search className="size-4 text-[#8b95a1]" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(items.length - 1, index + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(0, index - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(items[active]);
              }
            }}
            placeholder="Jump to a page, flow or contact…"
            className="w-full bg-transparent text-[14px] outline-none"
          />
          <kbd className="rounded border border-[#e5e7eb] px-1.5 text-[10px] text-[#8b95a1]">esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-[#6b7280]">Nothing found.</li> : null}
          {items.map((item, index) => {
            const Icon = item.kind === "contact" ? MessageCircle : ICONS[item.kind];
            return (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", index === active ? "bg-[#eef6ff]" : "")}
                >
                  <Icon className="size-4 shrink-0 text-[#6b7280]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[#1b1f24]">{item.label}</span>
                    {item.detail ? <span className="block truncate text-[11px] text-[#6b7280]">{item.detail}</span> : null}
                  </span>
                  <span className="text-[10px] tracking-wide text-[#8b95a1] uppercase">{item.kind}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
