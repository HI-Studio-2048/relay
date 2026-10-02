"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  Users,
  Workflow,
  Megaphone,
  LayoutDashboard,
  Settings,
  Menu,
  X,
  Link2,
  Repeat,
  ListFilter,
  MessageSquareText,
  Sparkles,
  Plug,
  MessageCircleQuestion,
  Search,
  Building2,
  RadioTower,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useBot } from "@/components/bot-provider";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { RelayLogo } from "@/components/chrome/relay-logo";
import { StatusPill } from "@/components/chrome/status-pill";
import { CanvasCard, ToneChip, type ToneName } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { CHANNELS } from "@/lib/channels/types";
import { cn } from "@/lib/utils";

const GROUPS: {
  label: string;
  items: {
    href: string;
    label: string;
    icon: typeof Inbox;
    tone: ToneName;
    count?: "inbox" | "confirm";
  }[];
}[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, tone: "start" },
      { href: "/inbox", label: "Inbox", icon: Inbox, tone: "content", count: "inbox" },
      { href: "/contacts", label: "Contacts", icon: Users, tone: "input" },
      { href: "/channels", label: "Channels", icon: RadioTower, tone: "start" },
      { href: "/accounts", label: "All accounts", icon: Building2, tone: "start" },
    ],
  },
  {
    label: "Automate",
    items: [
      { href: "/flows", label: "Flows", icon: Workflow, tone: "content" },
      { href: "/keywords", label: "Keywords", icon: MessageSquareText, tone: "content" },
      { href: "/starters", label: "Starters & hours", icon: MessageCircleQuestion, tone: "content" },
      { href: "/sequences", label: "Sequences", icon: Repeat, tone: "action" },
      { href: "/rules", label: "Rules", icon: ListFilter, tone: "action" },
      { href: "/broadcasts", label: "Broadcasts", icon: Megaphone, tone: "action", count: "confirm" },
      { href: "/ai", label: "AI assistant", icon: Sparkles, tone: "action" },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/growth", label: "Links", icon: Link2, tone: "action" },
      { href: "/integrations", label: "API & webhooks", icon: Plug, tone: "stop" },
    ],
  },
];

function sectionTitle(pathname: string) {
  if (pathname === "/") return "Overview";
  if (pathname.startsWith("/inbox")) return "Inbox";
  if (pathname.startsWith("/contacts")) return "Contacts";
  if (pathname.startsWith("/accounts")) return "All accounts";
  if (pathname.startsWith("/channels")) return "Channels";
  if (pathname.startsWith("/flows")) return "Flows";
  if (pathname.startsWith("/keywords")) return "Keywords";
  if (pathname.startsWith("/sequences")) return "Sequences";
  if (pathname.startsWith("/rules")) return "Rules";
  if (pathname.startsWith("/broadcasts")) return "Broadcasts";
  if (pathname.startsWith("/growth")) return "Growth";
  if (pathname.startsWith("/setup")) return "Settings";
  if (pathname.startsWith("/ai")) return "AI assistant";
  if (pathname.startsWith("/integrations")) return "API & webhooks";
  if (pathname.startsWith("/starters")) return "Conversation starters";
  return "Relay";
}

function NavCount({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-[#0084ff] px-1.5 text-center text-[10px] font-semibold tabular-nums text-white">
      {value > 99 ? "99+" : value}
    </span>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <RelayLogo />
      {compact ? null : (
        <span>
          <span className="block font-heading text-[15px] leading-none tracking-tight text-[#1b1f24]">Relay</span>
          <span className="mt-0.5 block text-[11px] text-[#6b7280]">HI Studio · Social automation</span>
        </span>
      )}
    </Link>
  );
}

function navItemClass(active: boolean) {
  return cn(
    "relay-nav-item flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] font-medium transition-colors",
    active ? "bg-[#eef6ff] text-[#1b1f24]" : "text-[#6b7280] hover:bg-[#f4f6f8] hover:text-[#1b1f24]",
  );
}

function SidebarNav({
  onNavigate,
  inboxCount,
  confirmCount,
}: {
  onNavigate?: () => void;
  inboxCount: number;
  confirmCount: number;
}) {
  const pathname = usePathname();
  const counts = { inbox: inboxCount, confirm: confirmCount };

  return (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  data-active={active ? "true" : "false"}
                  className={navItemClass(active)}
                >
                  <ToneChip tone={item.tone} icon={Icon} />
                  {item.label}
                  {"count" in item && item.count ? <NavCount value={counts[item.count]} /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function BotDock({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { bots, bot, setBotId } = useBot();
  const settingsActive = pathname.startsWith("/setup");

  return (
    <div className="space-y-2">
      <Link
        href="/setup"
        onClick={onNavigate}
        data-active={settingsActive ? "true" : "false"}
        className={navItemClass(settingsActive)}
      >
        <ToneChip tone="stop" icon={Settings} />
        Settings
      </Link>
      {bot ? (
        <CanvasCard className="p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-medium text-[#1b1f24]">{bot.name}</p>
            <StatusPill status={bot.status} />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-[#6b7280]">
            <span
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ background: CHANNELS[bot.channel ?? "telegram"].color }}
            />
            {CHANNELS[bot.channel ?? "telegram"].label}
            {bot.telegramUsername ? ` · ${bot.channel === "whatsapp" ? "" : "@"}${bot.telegramUsername}` : ""}
          </p>
          {bots.length > 1 ? (
            <select
              className="mt-2 w-full rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-[13px]"
              value={bot.id}
              onChange={(event) => setBotId(event.target.value)}
            >
              {bots.map((item) => (
                <option key={item.id} value={item.id}>
                  {CHANNELS[item.channel ?? "telegram"].label} · {item.name}
                </option>
              ))}
            </select>
          ) : null}
        </CanvasCard>
      ) : (
        <p className="px-2 text-[11px] text-[#6b7280]">No channel connected yet.</p>
      )}
    </div>
  );
}

function Sidebar({
  onNavigate,
  inboxCount,
  confirmCount,
}: {
  onNavigate?: () => void;
  inboxCount: number;
  confirmCount: number;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <Brand />
      </div>
      <SidebarNav onNavigate={onNavigate} inboxCount={inboxCount} confirmCount={confirmCount} />
      <div className="mt-auto pt-6">
        <BotDock onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function AppShell({
  children,
  inboxCount = 0,
  confirmCount = 0,
}: {
  children: React.ReactNode;
  inboxCount?: number;
  confirmCount?: number;
}) {
  const pathname = usePathname();
  const { bot } = useBot();
  const [open, setOpen] = useState(false);
  const flowCanvas = /^\/flows\/[^/]+$/.test(pathname);
  // Live Chat fills the viewport like the canvas, but keeps the top bar.
  const liveChat = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const immersive = flowCanvas || liveChat;
  const title = sectionTitle(pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={cn("flex bg-[#f4f6f8]", immersive ? "h-dvh overflow-hidden" : "min-h-dvh")}>
      <CommandPalette />
      <ShortcutsHelp />
      <aside className="hidden w-64 shrink-0 border-r border-[#e5e7eb] bg-white p-4 md:flex md:flex-col">
        <Sidebar inboxCount={inboxCount} confirmCount={confirmCount} />
      </aside>

      <div className={cn("flex min-w-0 flex-1 flex-col", immersive && "min-h-0")}>
        <header className="flex items-center justify-between border-b border-[#e5e7eb] bg-white px-4 py-3 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Brand compact />
            <span className="truncate font-heading text-sm text-[#1b1f24]">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {bot ? <StatusPill status={bot.status} /> : null}
            <Button
              variant="outline"
              size="icon"
              type="button"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
          </div>
        </header>

        {flowCanvas ? null : (
          <header className="relay-topbar hidden items-center justify-between border-b border-[#e5e7eb] bg-white px-6 py-3 md:flex">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">
                HI Studio · {bot ? CHANNELS[bot.channel ?? "telegram"].label : "Relay"}
              </p>
              <p className="font-heading text-[15px] tracking-tight text-[#1b1f24]">{title}</p>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("relay:search"))}
              className="ml-auto mr-3 flex w-64 items-center gap-2 rounded-lg bg-[#f4f6f8] px-3 py-1.5 text-[13px] text-[#8b95a1] ring-1 ring-[#e5e7eb] hover:text-[#1b1f24]"
            >
              <Search className="size-3.5" />
              Search
              <kbd className="ml-auto rounded border border-[#e5e7eb] bg-white px-1.5 text-[10px]">⌘K</kbd>
            </button>
            {bot ? (
              <div className="flex items-center gap-2 rounded-full bg-[#f4f6f8] px-2.5 py-1 ring-1 ring-[#e5e7eb]">
                <span className="max-w-40 truncate text-[12px] text-[#1b1f24]">
                  {bot.telegramUsername ? `@${bot.telegramUsername}` : bot.name}
                </span>
                <StatusPill status={bot.status} />
              </div>
            ) : (
              <Link href="/setup" className="text-[12px] text-[#6b7280] hover:text-[#1b1f24]">
                Connect a bot
              </Link>
            )}
          </header>
        )}

        {open ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/30"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb]">
              <Sidebar
                onNavigate={() => setOpen(false)}
                inboxCount={inboxCount}
                confirmCount={confirmCount}
              />
            </div>
          </div>
        ) : null}

        <main
          className={
            immersive
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "relay-chrome-page mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-7"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
