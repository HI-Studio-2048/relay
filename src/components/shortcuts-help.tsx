"use client";

import { useEffect, useState } from "react";

const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "⌘K / Ctrl+K", what: "Search pages, flows and contacts" },
  { keys: "?", what: "Show these shortcuts" },
  { keys: "j / k", what: "Live Chat: next / previous conversation" },
  { keys: "/", what: "Live Chat: search conversations" },
  { keys: "e", what: "Live Chat: mark the open conversation done" },
  { keys: "/ (in the reply box)", what: "Live Chat: saved replies" },
  { keys: "⌘S / Ctrl+S", what: "Flow editor: save" },
  { keys: "⌘Z · ⇧⌘Z", what: "Flow editor: undo · redo" },
  { keys: "⌘C · ⌘V", what: "Flow editor: copy · paste a step" },
];

/** "?" anywhere (outside text fields) lists the keyboard shortcuts. */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key === "?") setOpen((value) => !value);
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <p className="mb-3 font-heading text-[16px] text-[#1b1f24]">Keyboard shortcuts</p>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((item) => (
            <li key={item.keys} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-[#374151]">{item.what}</span>
              <kbd className="shrink-0 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-1.5 py-0.5 text-[11px] text-[#1b1f24]">{item.keys}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
