"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Bell,
  ClipboardList,
  CornerUpRight,
  Dices,
  Filter,
  Flag,
  GitBranch,
  Globe,
  Hash,
  ImageIcon,
  MessageSquare,
  PenLine,
  Sparkles,
  Square,
  Timer,
  Trophy,
  UserRound,
} from "lucide-react";
import { useNodeStats } from "@/components/flow-canvas/flow-stats-context";
import { MediaThumb } from "@/components/flow-canvas/media-picker";
import { MANYCHAT, NODE_TONE } from "@/components/flow-canvas/node-colors";
import { cn } from "@/lib/utils";
import { blockLabel, isMediaBlock, type CanvasNodeData } from "@/lib/flow-canvas";

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

function NodeStatsStrip({ id }: { id?: string }) {
  const stats = useNodeStats(id);
  if (!stats || stats.sent === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-[#f0f2f4] px-3 py-1.5 text-[10px] text-[#6b7280] tabular-nums">
      <span>
        Sent <span className="font-semibold text-[#1b1f24]">{stats.sent}</span>
      </span>
      {stats.clicks > 0 ? (
        <span>
          Clicked <span className="font-semibold text-[#1b1f24]">{stats.clicks}</span> · {Math.round(stats.ctr * 100)}%
        </span>
      ) : null}
    </div>
  );
}

function NodeFrame({
  id,
  selected,
  kind,
  icon: Icon,
  title,
  children,
}: {
  id?: string;
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
      <NodeStatsStrip id={id} />
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

export function TriggerNode({ id, selected }: NodeProps<FlowNode<"trigger">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="trigger" icon={Flag} title="Starting step">
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

function BlockButtons({ buttons }: { buttons: { id: string; text: string; url?: string }[] }) {
  if (buttons.length === 0) return null;
  return (
    <div className="space-y-1 pt-1">
      {buttons.map((button) => (
        <div
          key={button.id}
          className="relative flex items-center rounded-md border px-2 py-1 pr-3"
          style={{ borderColor: `${MANYCHAT.content}55`, background: "#fff", color: MANYCHAT.content }}
        >
          <span className="truncate text-xs font-medium">{button.text || "Untitled"}</span>
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
              style={handleStyle("send_message")}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function SendMessageNode({ id, selected, data }: NodeProps<FlowNode<"send_message">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="send_message" icon={MessageSquare} title="Send Message">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("send_message")} />
      {data.blocks.length === 0 ? (
        <p className="text-[11px]" style={{ color: MANYCHAT.muted }}>
          No content yet — add a text or image block
        </p>
      ) : null}
      {data.blocks.map((block) => {
        if (block.type === "delay") {
          return (
            <div
              key={block.id}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
              style={{ background: MANYCHAT.wash, color: MANYCHAT.muted }}
            >
              <Timer className="size-3" /> Typing {formatDelay(block.seconds)}
            </div>
          );
        }
        return (
          <div key={block.id} className="rounded-lg px-2 py-1.5" style={{ background: MANYCHAT.wash }}>
            {isMediaBlock(block) ? (
              block.media ? (
                <MediaThumb media={block.media} className="h-20" />
              ) : (
                <div
                  className="flex h-14 items-center justify-center rounded-md border border-dashed px-2 text-center text-[11px]"
                  style={{ borderColor: `${MANYCHAT.content}66`, color: MANYCHAT.content }}
                >
                  {blockLabel(block.type)}
                </div>
              )
            ) : null}
            {block.text || block.type === "text" ? (
              <Preview>{block.text || "Empty text block"}</Preview>
            ) : null}
            <BlockButtons buttons={block.buttons} />
          </div>
        );
      })}
      {data.quickReplies.length > 0 ? (
        <div className="space-y-1 pt-1">
          <p className="text-[10px] font-medium tracking-wide uppercase" style={{ color: MANYCHAT.muted }}>
            Quick replies
          </p>
          {data.quickReplies.map((reply) => (
            <div
              key={reply.id}
              className="relative flex items-center rounded-full border px-2.5 py-1 pr-3"
              style={{ borderColor: `${MANYCHAT.content}55`, color: MANYCHAT.ink }}
            >
              <span className="truncate text-xs">{reply.text || "Untitled"}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={reply.id}
                className={cn(handleClass(), "!right-[-15px]")}
                style={handleStyle("send_message")}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="relative flex items-center justify-end pt-1 pr-1 text-[10px]" style={{ color: MANYCHAT.muted }}>
        Next step
        <Handle
          type="source"
          position={Position.Right}
          id="next"
          className={cn(handleClass(), "!right-[-15px]")}
          style={handleStyle("send_message")}
        />
      </div>
    </NodeFrame>
  );
}

export function MessageNode({ id, selected, data }: NodeProps<FlowNode<"message">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="message" icon={MessageSquare} title="Content">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("message")} />
      <MediaThumb media={data.media} className="h-24" />
      <Preview>{data.text || "Empty message"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("message")} />
    </NodeFrame>
  );
}

export function MediaNode({ id, selected, data }: NodeProps<FlowNode<"media">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="media" icon={ImageIcon} title="Content">
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

export function ButtonsNode({ id, selected, data }: NodeProps<FlowNode<"buttons">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="buttons" icon={GitBranch} title="Content">
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
              style={{ background: MANYCHAT.wash, color: MANYCHAT.ink }}
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

export function CaptureNode({ id, selected, data }: NodeProps<FlowNode<"capture">>) {
  const fieldLabel = data.field.startsWith("custom:")
    ? `custom · ${data.field.slice("custom:".length)}`
    : data.field;
  return (
    <NodeFrame id={id} selected={selected} kind="capture" icon={UserRound} title="User input">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("capture")} />
      <p className="text-[11px] font-medium tracking-wide uppercase" style={{ color: MANYCHAT.input }}>
        {fieldLabel}
      </p>
      <Preview>{data.prompt || "Ask a question"}</Preview>
      {data.field === "phone" || data.skippable ? (
        <p className="text-[11px]" style={{ color: MANYCHAT.muted }}>
          {[data.field === "phone" ? "Share-phone button" : null, data.skippable ? "Skip button" : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("capture")} />
    </NodeFrame>
  );
}

export function FormNode({ id, selected, data }: NodeProps<FlowNode<"form">>) {
  const labels = data.fields.map((field) =>
    field.field.startsWith("custom:") ? field.field.slice("custom:".length) : field.field,
  );
  return (
    <NodeFrame id={id} selected={selected} kind="form" icon={ClipboardList} title="User input">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("form")} />
      <Preview>{data.intro || "Collect a few answers"}</Preview>
      <p className="text-[11px]" style={{ color: MANYCHAT.muted }}>
        {labels.length > 0 ? labels.join(" → ") : "No fields yet"}
      </p>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("form")} />
    </NodeFrame>
  );
}

export function TagNode({ id, selected, data }: NodeProps<FlowNode<"tag">>) {
  const action = data.action === "remove" ? "Remove" : "Add";
  return (
    <NodeFrame id={id} selected={selected} kind="tag" icon={Hash} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("tag")} />
      <Preview>
        {data.tagName ? `${action} #${data.tagName}` : `${action} tag`}
      </Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("tag")} />
    </NodeFrame>
  );
}

export function SetFieldNode({ id, selected, data }: NodeProps<FlowNode<"set_field">>) {
  const fieldLabel = data.field.startsWith("custom:")
    ? data.field.slice("custom:".length) || "custom"
    : data.field;
  const preview = data.value.trim() ? `${fieldLabel} = ${data.value}` : `Clear ${fieldLabel}`;
  return (
    <NodeFrame id={id} selected={selected} kind="set_field" icon={PenLine} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("set_field")} />
      <Preview>{preview}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("set_field")} />
    </NodeFrame>
  );
}

export function SubscribeNode({ id, selected, data }: NodeProps<FlowNode<"subscribe">>) {
  const action = data.action === "unsubscribe" ? "Unsubscribe" : "Subscribe";
  const list = data.listName.trim();
  return (
    <NodeFrame id={id} selected={selected} kind="subscribe" icon={Bell} title="Action">
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

export function DelayNode({ id, selected, data }: NodeProps<FlowNode<"delay">>) {
  const window =
    data.sendAfter && data.sendBefore ? ` · ${data.sendAfter}–${data.sendBefore}` : "";
  return (
    <NodeFrame id={id} selected={selected} kind="delay" icon={Timer} title="Smart Delay">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("delay")} />
      <Preview>Wait {formatDelay(data.seconds)}{window}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("delay")} />
    </NodeFrame>
  );
}

export function RandomizerNode({ id, selected, data }: NodeProps<FlowNode<"randomizer">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="randomizer" icon={Dices} title="A/B split">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("randomizer")} />
      <Preview>
        {data.paths.map((path, index) => `${path.percent}% → ${String.fromCharCode(65 + index)}`).join(" · ")}
      </Preview>
      <div className="flex h-1.5 overflow-hidden rounded-full" style={{ background: MANYCHAT.wash }}>
        {data.paths.map((path, index) => (
          <span
            key={path.id}
            className="h-full"
            style={{
              width: `${path.percent}%`,
              background: index === 0 ? MANYCHAT.randomizer : index === 1 ? MANYCHAT.content : MANYCHAT.action,
            }}
          />
        ))}
      </div>
      <p className="text-[11px]" style={{ color: MANYCHAT.muted }}>
        {data.sticky ? "Sticky variant" : "Random every time"}
      </p>
      <div className="relative space-y-1 pt-1">
        {data.paths.map((path, index) => (
          <div
            key={path.id}
            className="relative flex items-center rounded-md px-2 py-1 pr-3"
            style={{ background: MANYCHAT.wash }}
          >
            <span className="text-xs">
              {path.percent}% goes to {String.fromCharCode(65 + index)}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={path.id}
              className={cn(handleClass(), "!right-[-15px]")}
              style={handleStyle("randomizer")}
            />
          </div>
        ))}
      </div>
    </NodeFrame>
  );
}

export function ConditionNode({ id, selected, data }: NodeProps<FlowNode<"condition">>) {
  const summary =
    data.check === "tag"
      ? data.tagName
        ? `Has #${data.tagName}`
        : "Has a tag"
      : data.check === "subscription"
        ? !data.tagName.trim() || data.tagName.trim().toLowerCase() === "all"
          ? "Subscribed (not opted out)"
          : `Subscribed to “${data.tagName}”`
        : `${data.field} ${data.op === "eq" ? "=" : data.op === "contains" ? "contains" : "is set"}${
            data.op !== "set" && data.value ? ` “${data.value}”` : ""
          }`;
  return (
    <NodeFrame id={id} selected={selected} kind="condition" icon={Filter} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("condition")} />
      <Preview>{summary}</Preview>
      <div className="relative space-y-1 pt-1">
        <div className="relative flex items-center rounded-md px-2 py-1 pr-3" style={{ background: MANYCHAT.wash }}>
          <span className="text-xs">Yes</span>
          <Handle
            type="source"
            position={Position.Right}
            id="yes"
            className={cn(handleClass(), "!right-[-15px]")}
            style={handleStyle("condition")}
          />
        </div>
        <div className="relative flex items-center rounded-md px-2 py-1 pr-3" style={{ background: MANYCHAT.wash }}>
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

export function StartFlowNode({ id, selected, data }: NodeProps<FlowNode<"start_flow">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="start_flow" icon={CornerUpRight} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("start_flow")} />
      <Preview>{data.flowId ? "Start another flow" : "Pick a flow"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("start_flow")} />
    </NodeFrame>
  );
}

export function HttpNode({ id, selected, data }: NodeProps<FlowNode<"http">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="http" icon={Globe} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("http")} />
      <Preview>
        {data.method} {data.url || "https://"}
      </Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("http")} />
    </NodeFrame>
  );
}

export function NotifyNode({ id, selected, data }: NodeProps<FlowNode<"notify">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="notify" icon={Bell} title="Action">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("notify")} />
      <Preview>{data.text || "Notify admin"}</Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("notify")} />
    </NodeFrame>
  );
}

export function AiNode({ id, selected, data }: NodeProps<FlowNode<"ai">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="ai" icon={Sparkles} title="AI Step">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("ai")} />
      <Preview>{data.goal || "Describe the goal"}</Preview>
      {data.collect.trim() ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">Collects {data.collect}</p>
      ) : null}
      <p className="mt-1 text-right text-[10px] text-muted-foreground">Goal reached →</p>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("ai")} />
    </NodeFrame>
  );
}

export function GoalNode({ id, selected, data }: NodeProps<FlowNode<"goal">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="goal" icon={Trophy} title="Goal">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("goal")} />
      <Preview>
        {data.name || "Conversion"}
        {data.value.trim() ? ` · ${data.value}` : ""}
      </Preview>
      <Handle type="source" position={Position.Right} id="next" className={handleClass()} style={handleStyle("goal")} />
    </NodeFrame>
  );
}

export function EndNode({ id, selected, data }: NodeProps<FlowNode<"end">>) {
  return (
    <NodeFrame id={id} selected={selected} kind="end" icon={Square} title="Stop">
      <Handle type="target" position={Position.Left} id="in" className={handleClass()} style={handleStyle("end")} />
      <Preview>{data.text || "Stop the flow"}</Preview>
    </NodeFrame>
  );
}

export const flowNodeTypes = {
  trigger: TriggerNode,
  send_message: SendMessageNode,
  message: MessageNode,
  media: MediaNode,
  buttons: ButtonsNode,
  capture: CaptureNode,
  form: FormNode,
  tag: TagNode,
  set_field: SetFieldNode,
  subscribe: SubscribeNode,
  delay: DelayNode,
  randomizer: RandomizerNode,
  condition: ConditionNode,
  start_flow: StartFlowNode,
  http: HttpNode,
  notify: NotifyNode,
  ai: AiNode,
  goal: GoalNode,
  end: EndNode,
};
