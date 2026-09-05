"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Bell,
  ClipboardList,
  Filter,
  Flag,
  GitBranch,
  Hash,
  ImageIcon,
  MessageSquare,
  Square,
  Timer,
  UserRound,
} from "lucide-react";
import { MediaThumb } from "@/components/flow-canvas/media-picker";
import { MANYCHAT, NODE_TONE } from "@/components/flow-canvas/node-colors";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "@/lib/flow-canvas";

type FlowNode<K extends CanvasNodeData["kind"]> = Node<Extract<CanvasNodeData, { kind: K }>, K>;

function handleClass() {
  return cn("!size-2.5 !border-2 !bg-white");
}

function handleStyle(kind: CanvasNodeData["kind"]) {
  return { borderColor: NODE_TONE[kind].hex };
}

function formatDelay(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0));
  if (value === 0) return "Continue immediately";
  if (value < 60) return `${value}s`;
  if (value % 3600 === 0) return `${value / 3600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  return `${Math.floor(value / 60)}m ${value % 60}s`;
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
        className={handleClass()}
        style={handleStyle("trigger")}
      />
    </NodeFrame>
  );
}

export function MessageNode({ selected, data }: NodeProps<FlowNode<"message">>) {
  return (
    <NodeFrame selected={selected} kind="message" icon={MessageSquare} title="Content">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("message")} />
      <MediaThumb media={data.media} className="h-24" />
      <Preview>{data.text || "Empty message"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("message")} />
    </NodeFrame>
  );
}

export function MediaNode({ selected, data }: NodeProps<FlowNode<"media">>) {
  return (
    <NodeFrame selected={selected} kind="media" icon={ImageIcon} title="Content">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("media")} />
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
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("media")} />
    </NodeFrame>
  );
}

export function ButtonsNode({ selected, data }: NodeProps<FlowNode<"buttons">>) {
  return (
    <NodeFrame selected={selected} kind="buttons" icon={GitBranch} title="Content">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("buttons")} />
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
              {button.url ? (
                <span className="ml-auto pl-2 text-[10px] uppercase" style={{ color: MANYCHAT.muted }}>
                  URL
                </span>
              ) : (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={button.id}
                  className={cn(handleClass(), "!right-[-15px]")}
                  style={handleStyle("buttons")}
                />
              )}
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
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("capture")} />
      <p className="text-[11px] font-medium tracking-wide uppercase" style={{ color: MANYCHAT.input }}>
        {fieldLabel}
      </p>
      <Preview>{data.prompt || "Ask a question"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("capture")} />
    </NodeFrame>
  );
}

export function FormNode({ selected, data }: NodeProps<FlowNode<"form">>) {
  const labels = data.fields.map((field) =>
    field.field.startsWith("custom:") ? field.field.slice("custom:".length) : field.field,
  );
  return (
    <NodeFrame selected={selected} kind="form" icon={ClipboardList} title="User input">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("form")} />
      <Preview>{data.intro || "Collect a few answers"}</Preview>
      <p className="text-[11px]" style={{ color: MANYCHAT.muted }}>
        {labels.length > 0 ? labels.join(" → ") : "No fields yet"}
      </p>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("form")} />
    </NodeFrame>
  );
}

export function TagNode({ selected, data }: NodeProps<FlowNode<"tag">>) {
  const action = data.action === "remove" ? "Remove" : "Add";
  return (
    <NodeFrame selected={selected} kind="tag" icon={Hash} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("tag")} />
      <Preview>
        {data.tagName ? `${action} #${data.tagName}` : `${action} tag`}
      </Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("tag")} />
    </NodeFrame>
  );
}

export function SubscribeNode({ selected, data }: NodeProps<FlowNode<"subscribe">>) {
  const action = data.action === "unsubscribe" ? "Unsubscribe" : "Subscribe";
  const list = data.listName.trim();
  return (
    <NodeFrame selected={selected} kind="subscribe" icon={Bell} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("subscribe")} />
      <Preview>
        {data.action === "unsubscribe" && (!list || list.toLowerCase() === "all")
          ? "Unsubscribe from all broadcasts"
          : `${action} ${list ? `“${list}”` : "a list"}`}
      </Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("subscribe")} />
    </NodeFrame>
  );
}

export function DelayNode({ selected, data }: NodeProps<FlowNode<"delay">>) {
  return (
    <NodeFrame selected={selected} kind="delay" icon={Timer} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("delay")} />
      <Preview>Wait {formatDelay(data.seconds)}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("delay")} />
    </NodeFrame>
  );
}

export function ConditionNode({ selected, data }: NodeProps<FlowNode<"condition">>) {
  const summary =
    data.check === "tag"
      ? data.tagName
        ? `Has #${data.tagName}`
        : "Has a tag"
      : `${data.field} ${data.op === "eq" ? "=" : data.op === "contains" ? "contains" : "is set"}${
          data.op !== "set" && data.value ? ` “${data.value}”` : ""
        }`;
  return (
    <NodeFrame selected={selected} kind="condition" icon={Filter} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("condition")} />
      <Preview>{summary}</Preview>
      <div className="relative space-y-1 pt-1">
        <div className="relative flex items-center rounded-md px-2 py-1 pr-3" style={{ background: "#F3F4F6" }}>
          <span className="text-xs">Yes</span>
          <Handle
            type="source"
            position={Position.Right}
            id="yes"
            className={cn(handleClass(), "!right-[-15px]")}
            style={handleStyle("condition")}
          />
        </div>
        <div className="relative flex items-center rounded-md px-2 py-1 pr-3" style={{ background: "#F3F4F6" }}>
          <span className="text-xs">No</span>
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            className={cn(handleClass(), "!right-[-15px]")}
            style={handleStyle("condition")}
          />
        </div>
      </div>
    </NodeFrame>
  );
}

export function EndNode({ selected, data }: NodeProps<FlowNode<"end">>) {
  return (
    <NodeFrame selected={selected} kind="end" icon={Square} title="Stop">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("end")} />
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
  form: FormNode,
  tag: TagNode,
  subscribe: SubscribeNode,
  delay: DelayNode,
  condition: ConditionNode,
  end: EndNode,
};
