"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Flag, GitBranch, Hash, ImageIcon, MessageSquare, Square, UserRound } from "lucide-react";
import { MediaThumb } from "@/components/flow-canvas/media-picker";
import { NODE_TONE } from "@/components/flow-canvas/node-colors";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "@/lib/flow-canvas";

type FlowNode<K extends CanvasNodeData["kind"]> = Node<Extract<CanvasNodeData, { kind: K }>, K>;

function handleClass(kind: CanvasNodeData["kind"]) {
  return cn(
    "!size-2.5 !border-2 !bg-background",
    NODE_TONE[kind].handle,
  );
}

function NodeFrame({
  selected,
  kind,
  icon: Icon,
  title,
  children,
}: {
  selected: boolean;
  kind: CanvasNodeData["kind"];
  icon: typeof Flag;
  title: string;
  children: React.ReactNode;
}) {
  const tone = NODE_TONE[kind];
  return (
    <div
      className={cn(
        "w-[248px] overflow-hidden rounded-xl border bg-card shadow-md",
        selected ? "ring-2 ring-offset-2 ring-offset-background" : "border-border",
      )}
      style={
        selected
          ? { borderColor: tone.hex, boxShadow: `0 0 0 3px ${tone.hex}55` }
          : { borderColor: `${tone.hex}66` }
      }
    >
      <div className={cn("flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide", tone.header)}>
        <Icon className="size-3.5" />
        {title}
      </div>
      <div className={cn("space-y-1.5 px-3 py-2.5 text-sm", tone.wash)}>{children}</div>
    </div>
  );
}

function Preview({ children }: { children: React.ReactNode }) {
  return <p className="line-clamp-3 text-[13px] leading-snug text-foreground/90">{children}</p>;
}

export function TriggerNode({ selected }: NodeProps<FlowNode<"trigger">>) {
  return (
    <NodeFrame selected={selected} kind="trigger" icon={Flag} title="Trigger">
      <Preview>Starts this flow</Preview>
      <Handle type="source" position={Position.Right} id="out" className={handleClass("trigger")} />
    </NodeFrame>
  );
}

export function MessageNode({ selected, data }: NodeProps<FlowNode<"message">>) {
  return (
    <NodeFrame selected={selected} kind="message" icon={MessageSquare} title="Message">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("message")} />
      <MediaThumb media={data.media} className="h-24" />
      <Preview>{data.text || "Empty message"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass("message")} />
    </NodeFrame>
  );
}

export function MediaNode({ selected, data }: NodeProps<FlowNode<"media">>) {
  return (
    <NodeFrame selected={selected} kind="media" icon={ImageIcon} title="Image / GIF">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("media")} />
      {data.media ? (
        <MediaThumb media={data.media} className="h-28" />
      ) : (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-rose-400/50 bg-rose-500/10 px-2 text-center text-[11px] text-rose-200">
          Drop an image or GIF, or attach one in the inspector
        </div>
      )}
      {data.text ? <Preview>{data.text}</Preview> : null}
      <Handle type="source" position={Position.Right} id="next" className={handleClass("media")} />
    </NodeFrame>
  );
}

export function ButtonsNode({ selected, data }: NodeProps<FlowNode<"buttons">>) {
  return (
    <NodeFrame selected={selected} kind="buttons" icon={GitBranch} title="Buttons">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("buttons")} />
      <MediaThumb media={data.media} className="h-20" />
      <Preview>{data.text || "Choose an option"}</Preview>
      <div className="space-y-1 pt-1">
        {data.buttons.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No buttons yet</p>
        ) : (
          data.buttons.map((button) => (
            <div
              key={button.id}
              className="relative flex items-center rounded-md bg-violet-500/15 px-2 py-1 pr-3 ring-1 ring-violet-400/30"
            >
              <span className="truncate text-xs">{button.text || "Untitled"}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={button.id}
                className={cn(handleClass("buttons"), "!right-[-15px]")}
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
    <NodeFrame selected={selected} kind="capture" icon={UserRound} title="Capture">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("capture")} />
      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-300">{fieldLabel}</p>
      <Preview>{data.prompt || "Ask a question"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass("capture")} />
    </NodeFrame>
  );
}

export function TagNode({ selected, data }: NodeProps<FlowNode<"tag">>) {
  return (
    <NodeFrame selected={selected} kind="tag" icon={Hash} title="Tag">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("tag")} />
      <Preview>{data.tagName ? `#${data.tagName}` : "No tag"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass("tag")} />
    </NodeFrame>
  );
}

export function EndNode({ selected, data }: NodeProps<FlowNode<"end">>) {
  return (
    <NodeFrame selected={selected} kind="end" icon={Square} title="End">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("end")} />
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
