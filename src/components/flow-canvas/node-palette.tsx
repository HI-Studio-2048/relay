"use client";

import { GitBranch, Hash, ImageIcon, MessageSquare, Square, UserRound } from "lucide-react";
import { NODE_TONE } from "@/components/flow-canvas/node-colors";
import type { CanvasNodeKind } from "@/lib/flow-canvas";

const GROUPS: {
  label: string;
  items: {
    kind: Exclude<CanvasNodeKind, "trigger">;
    label: string;
    hint: string;
    icon: typeof MessageSquare;
  }[];
}[] = [
  {
    label: "Content",
    items: [
      { kind: "message", label: "Message", hint: "Send text", icon: MessageSquare },
      { kind: "media", label: "Image / GIF", hint: "Photo or animation", icon: ImageIcon },
      { kind: "buttons", label: "Buttons", hint: "Branch on tap", icon: GitBranch },
    ],
  },
  {
    label: "Collect & actions",
    items: [
      { kind: "capture", label: "User input", hint: "Name, email, phone", icon: UserRound },
      { kind: "tag", label: "Action", hint: "Apply a CRM tag", icon: Hash },
      { kind: "end", label: "Stop", hint: "Stop the flow", icon: Square },
    ],
  },
];

export function NodePalette({
  onAdd,
}: {
  onAdd: (kind: Exclude<CanvasNodeKind, "trigger">) => void;
}) {
  return (
    <aside className="flex shrink-0 flex-row gap-2 overflow-x-auto border-b bg-sidebar/80 p-2 md:w-52 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
      {GROUPS.map((group) => (
        <div key={group.label} className="flex flex-row gap-2 md:flex-col">
          <p className="hidden px-1 pt-1 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase md:block">
            {group.label}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const hex = NODE_TONE[item.kind].hex;
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
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: hex }}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{item.label}</span>
                  <span className="hidden truncate text-[11px] text-muted-foreground md:block">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <p className="hidden px-1 text-[11px] leading-snug text-muted-foreground md:block">
        Drag a step onto the canvas, or drop an image/GIF file to create a media node.
      </p>
    </aside>
  );
}
