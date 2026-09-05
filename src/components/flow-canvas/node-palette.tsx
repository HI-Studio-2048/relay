"use client";

import { GitBranch, Hash, ImageIcon, MessageSquare, Square, UserRound } from "lucide-react";
import type { CanvasNodeKind } from "@/lib/flow-canvas";

export const PALETTE_ITEMS: {
  kind: Exclude<CanvasNodeKind, "trigger">;
  label: string;
  hint: string;
  icon: typeof MessageSquare;
}[] = [
  { kind: "message", label: "Message", hint: "Send text", icon: MessageSquare },
  { kind: "media", label: "Image / GIF", hint: "Photo or animation", icon: ImageIcon },
  { kind: "buttons", label: "Buttons", hint: "Branch on tap", icon: GitBranch },
  { kind: "capture", label: "Capture", hint: "Name, email, phone", icon: UserRound },
  { kind: "tag", label: "Tag", hint: "Apply a CRM tag", icon: Hash },
  { kind: "end", label: "End", hint: "Stop the flow", icon: Square },
];

export function NodePalette({
  onAdd,
}: {
  onAdd: (kind: Exclude<CanvasNodeKind, "trigger">) => void;
}) {
  return (
    <aside className="flex shrink-0 flex-row gap-2 overflow-x-auto border-b bg-sidebar/80 p-2 md:w-52 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
      <p className="hidden px-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:block">
        Add step
      </p>
      {PALETTE_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.kind}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/relay-node", item.kind);
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onAdd(item.kind)}
            className="flex min-w-36 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-sm hover:bg-muted/60 md:min-w-0"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block font-medium">{item.label}</span>
              <span className="hidden truncate text-[11px] text-muted-foreground md:block">{item.hint}</span>
            </span>
          </button>
        );
      })}
      <p className="hidden px-1 text-[11px] leading-snug text-muted-foreground md:block">
        Drag onto the canvas or click to drop in the center. Connect handles to set the next step.
      </p>
    </aside>
  );
}
