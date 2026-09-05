"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Flag, GitBranch, Hash, ImageIcon, MessageSquare, Square, UserRound } from "lucide-react";
import { MediaThumb } from "@/components/flow-canvas/media-picker";
import { MANYCHAT, NODE_TONE } from "@/components/flow-canvas/node-colors";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "@/lib/flow-canvas";

type FlowNode<K extends CanvasNodeData["kind"]> = Node<Extract<CanvasNodeData, { kind: K }>, K>;

function handleClass(kind: CanvasNodeData["kind"]) {
  return cn("!size-2.5 !border-2 !bg-white");
}

function handleStyle(kind: CanvasNodeData["kind"]) {
  return { borderColor: NODE_TONE[kind].hex };
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
      className="w-[248px] rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10)]"
      style={{
        border: `1px solid ${selected ? tone.hex : MANYCHAT.cardBorder}`,
        boxShadow: selected ? `0 0 0 3px ${tone.hex}33` : "0 1px 3px rgba(16,24,40,0.10)",
      }}
    >
      <div className="flex items-center gap-2 px-3 pt-3">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: tone.hex }}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: tone.hex }}>
          {title}
        </span>
      </div>
      <div className="space-y-1.5 px-3 pt-2 pb-3 text-sm" style={{ color: MANYCHAT.ink }}>
        {children}
      </div>
    </div>
  );
}

function Preview({ children }: { children: React.ReactNode }) {
  return (
    <p className="line-clamp-3 text-[13px] leading-snug" style={{ color: MANYCHAT.ink }}>
      {children}
    </p>
  );
}

export function TriggerNode({ selected }: NodeProps<FlowNode<"trigger">>) {
  return (
    <NodeFrame selected={selected} kind="trigger" icon={Flag} title="Starting step">
      <Preview>Starts this flow</Preview>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className={handleClass("trigger")}
        style={handleStyle("trigger")}
      />
    </NodeFrame>
  );
}

export function MessageNode({ selected, data }: NodeProps<FlowNode<"message">>) {
  return (
    <NodeFrame selected={selected} kind="message" icon={MessageSquare} title="Content">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("message")} style={handleStyle("message")} />
      <MediaThumb media={data.media} className="h-24" />
      <Preview>{data.text || "Empty message"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass("message")} style={handleStyle("message")} />
    </NodeFrame>
  );
}

export function MediaNode({ selected, data }: NodeProps<FlowNode<"media">>) {
  return (
    <NodeFrame selected={selected} kind="media" icon={ImageIcon} title="Content">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("media")} style={handleStyle("media")} />
      {data.media ? (
        <MediaThumb media={data.media} className="h-28" />
      ) : (
        <div
          className="flex h-20 items-center justify-center rounded-md border border-dashed px-2 text-center text-[11px]"
          style={{ borderColor: `${MANYCHAT.content}66`, background: `${MANYCHAT.content}0F`, color: MANYCHAT.content }}
        >
          Drop an image or GIF, or attach one in the inspector
        </div>
      )}
      {data.text ? <Preview>{data.text}</Preview> : null}
      <Handle type="source" position={Position.Right} id="next" className={handleClass("media")} style={handleStyle("media")} />
    </NodeFrame>
  );
}

export function ButtonsNode({ selected, data }: NodeProps<FlowNode<"buttons">>) {
  return (
    <NodeFrame selected={selected} kind="buttons" icon={GitBranch} title="Content">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("buttons")} style={handleStyle("buttons")} />
      <MediaThumb media={data.media} className="h-20" />
      <Preview>{data.text || "Choose an option"}</Preview>
      <div className="space-y-1 pt-1">
        {data.buttons.length === 0 ? (
          <p className="text-[11px]" style={{ color: MANYCHAT.muted }}>
            No buttons yet
          </p>
        ) : (
          data.buttons.map((button) => (
            <div
              key={button.id}
              className="relative flex items-center rounded-md px-2 py-1 pr-3"
              style={{ background: "#F3F4F6", color: MANYCHAT.ink }}
            >
              <span className="truncate text-xs">{button.text || "Untitled"}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={button.id}
                className={cn(handleClass("buttons"), "!right-[-15px]")}
                style={handleStyle("buttons")}
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
    <NodeFrame selected={selected} kind="capture" icon={UserRound} title="User input">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("capture")} style={handleStyle("capture")} />
      <p className="text-[11px] font-medium tracking-wide uppercase" style={{ color: MANYCHAT.input }}>
        {fieldLabel}
      </p>
      <Preview>{data.prompt || "Ask a question"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass("capture")} style={handleStyle("capture")} />
    </NodeFrame>
  );
}

export function TagNode({ selected, data }: NodeProps<FlowNode<"tag">>) {
  return (
    <NodeFrame selected={selected} kind="tag" icon={Hash} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("tag")} style={handleStyle("tag")} />
      <Preview>{data.tagName ? `#${data.tagName}` : "No tag"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass("tag")} style={handleStyle("tag")} />
    </NodeFrame>
  );
}

export function EndNode({ selected, data }: NodeProps<FlowNode<"end">>) {
  return (
    <NodeFrame selected={selected} kind="end" icon={Square} title="Stop">
      <Handle type="target" position={Position.Left} id="in" className={handleClass("end")} style={handleStyle("end")} />
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
