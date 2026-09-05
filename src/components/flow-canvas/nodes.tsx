"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Flag, GitBranch, Hash, ImageIcon, MessageSquare, Square, UserRound } from "lucide-react";
import { MediaThumb } from "@/components/flow-canvas/media-picker";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "@/lib/flow-canvas";

type FlowNode<K extends CanvasNodeData["kind"]> = Node<Extract<CanvasNodeData, { kind: K }>, K>;

const handleClass =
  "!size-2.5 !border-2 !bg-background !border-primary hover:!bg-primary";

function NodeFrame({
  selected,
  accent,
  icon: Icon,
  title,
  children,
}: {
  selected: boolean;
  accent: string;
  icon: typeof Flag;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-[240px] rounded-xl border bg-card shadow-md",
        selected ? "border-primary ring-2 ring-primary/35" : "border-border",
      )}
    >
      <div className={cn("flex items-center gap-1.5 rounded-t-[11px] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide", accent)}>
        <Icon className="size-3.5" />
        {title}
      </div>
      <div className="space-y-1.5 px-3 py-2.5 text-sm">{children}</div>
    </div>
  );
}

function Preview({ children }: { children: React.ReactNode }) {
  return <p className="line-clamp-3 text-[13px] leading-snug text-foreground/90">{children}</p>;
}

export function TriggerNode({ selected }: NodeProps<FlowNode<"trigger">>) {
  return (
    <NodeFrame selected={selected} accent="bg-primary/15 text-primary" icon={Flag} title="Trigger">
      <Preview>Starts this flow</Preview>
      <Handle type="source" position={Position.Right} id="out" className={handleClass} />
    </NodeFrame>
  );
}

export function MessageNode({ selected, data }: NodeProps<FlowNode<"message">>) {
  return (
    <NodeFrame selected={selected} accent="bg-sky-500/15 text-sky-300" icon={MessageSquare} title="Message">
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <MediaThumb media={data.media} className="h-24" />
      <Preview>{data.text || "Empty message"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass} />
    </NodeFrame>
  );
}

export function MediaNode({ selected, data }: NodeProps<FlowNode<"media">>) {
  return (
    <NodeFrame selected={selected} accent="bg-rose-500/15 text-rose-300" icon={ImageIcon} title="Image / GIF">
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      {data.media ? (
        <MediaThumb media={data.media} className="h-28" />
      ) : (
        <p className="text-[11px] text-muted-foreground">Upload or attach a URL</p>
      )}
      {data.text ? <Preview>{data.text}</Preview> : null}
      <Handle type="source" position={Position.Right} id="next" className={handleClass} />
    </NodeFrame>
  );
}

export function ButtonsNode({ selected, data }: NodeProps<FlowNode<"buttons">>) {
  return (
    <NodeFrame selected={selected} accent="bg-violet-500/15 text-violet-300" icon={GitBranch} title="Buttons">
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <MediaThumb media={data.media} className="h-20" />
      <Preview>{data.text || "Choose an option"}</Preview>
      <div className="space-y-1 pt-1">
        {data.buttons.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No buttons yet</p>
        ) : (
          data.buttons.map((button) => (
            <div
              key={button.id}
              className="relative flex items-center rounded-md bg-muted/70 px-2 py-1 pr-3"
            >
              <span className="truncate text-xs">{button.text || "Untitled"}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={button.id}
                className={cn(handleClass, "!right-[-15px]")}
              />
            </div>
          ))
        )}
      </div>
    </NodeFrame>
  );
}

export function CaptureNode({ selected, data }: NodeProps<FlowNode<"capture">>) {
  const fieldLabel = data.field.startsWith("custom:")
    ? `custom · ${data.field.slice("custom:".length)}`
    : data.field;
  return (
    <NodeFrame selected={selected} accent="bg-emerald-500/15 text-emerald-300" icon={UserRound} title="Capture">
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{fieldLabel}</p>
      <Preview>{data.prompt || "Ask a question"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass} />
    </NodeFrame>
  );
}

export function TagNode({ selected, data }: NodeProps<FlowNode<"tag">>) {
  return (
    <NodeFrame selected={selected} accent="bg-amber-500/15 text-amber-300" icon={Hash} title="Tag">
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <Preview>{data.tagName ? `#${data.tagName}` : "No tag"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass} />
    </NodeFrame>
  );
}

export function EndNode({ selected, data }: NodeProps<FlowNode<"end">>) {
  return (
    <NodeFrame selected={selected} accent="bg-muted text-muted-foreground" icon={Square} title="End">
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <Preview>{data.text || "Stop the flow"}</Preview>
    </NodeFrame>
  );
}

export const flowNodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  media: MediaNode,
  buttons: ButtonsNode,
  capture: CaptureNode,
  tag: TagNode,
  end: EndNode,
};
