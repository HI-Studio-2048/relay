import type { CanvasNodeKind } from "@/lib/flow-canvas";

export type NodeTone = {
  hex: string;
  header: string;
  chip: string;
  wash: string;
  handle: string;
};

export const NODE_TONE: Record<CanvasNodeKind, NodeTone> = {
  trigger: {
    hex: "#f59e0b",
    header: "bg-amber-500 text-white",
    chip: "bg-amber-500 text-white",
    wash: "bg-amber-500/12",
    handle: "!border-amber-400 hover:!bg-amber-400",
  },
  message: {
    hex: "#0ea5e9",
    header: "bg-sky-500 text-white",
    chip: "bg-sky-500 text-white",
    wash: "bg-sky-500/12",
    handle: "!border-sky-400 hover:!bg-sky-400",
  },
  media: {
    hex: "#f43f5e",
    header: "bg-rose-500 text-white",
    chip: "bg-rose-500 text-white",
    wash: "bg-rose-500/12",
    handle: "!border-rose-400 hover:!bg-rose-400",
  },
  buttons: {
    hex: "#8b5cf6",
    header: "bg-violet-500 text-white",
    chip: "bg-violet-500 text-white",
    wash: "bg-violet-500/12",
    handle: "!border-violet-400 hover:!bg-violet-400",
  },
  capture: {
    hex: "#10b981",
    header: "bg-emerald-500 text-white",
    chip: "bg-emerald-500 text-white",
    wash: "bg-emerald-500/12",
    handle: "!border-emerald-400 hover:!bg-emerald-400",
  },
  tag: {
    hex: "#f97316",
    header: "bg-orange-500 text-white",
    chip: "bg-orange-500 text-white",
    wash: "bg-orange-500/12",
    handle: "!border-orange-400 hover:!bg-orange-400",
  },
  end: {
    hex: "#64748b",
    header: "bg-slate-500 text-white",
    chip: "bg-slate-500 text-white",
    wash: "bg-slate-500/12",
    handle: "!border-slate-400 hover:!bg-slate-400",
  },
};

export function nodeHex(kind: string | undefined): string {
  if (kind && kind in NODE_TONE) return NODE_TONE[kind as CanvasNodeKind].hex;
  return NODE_TONE.message.hex;
}
