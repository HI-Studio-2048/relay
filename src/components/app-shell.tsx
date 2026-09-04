"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  Users,
  Workflow,
  Megaphone,
  LayoutDashboard,
  Cable,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { useBot } from "@/components/bot-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/flows", label: "Flows", icon: Workflow },
  { href: "/broadcasts", label: "Broadcasts", icon: Megaphone },
  { href: "/setup", label: "Bot", icon: Cable },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bots, bot, setBotId } = useBot();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-full bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar p-4 md:flex md:flex-col">
        <div className="mb-6 px-2">
          <p className="font-heading text-lg tracking-tight">Relay</p>
          <p className="text-xs text-muted-foreground">HI Studio · Telegram</p>
        </div>
        {nav}
        <div className="mt-auto pt-6">
          {bots.length > 0 ? (
            <select
              className="w-full rounded-lg border border-input bg-background px-2 py-2 text-xs"
              value={bot?.id ?? ""}
              onChange={(event) => setBotId(event.target.value)}
            >
              {bots.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.status}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">No bot connected</p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <div>
            <p className="font-heading text-base">Relay</p>
            <p className="text-xs text-muted-foreground">{bot?.name ?? "No bot"}</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setOpen((value) => !value)}>
            <Menu className="size-4" />
          </Button>
        </header>
        {open ? <div className="border-b bg-sidebar p-3 md:hidden">{nav}</div> : null}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
