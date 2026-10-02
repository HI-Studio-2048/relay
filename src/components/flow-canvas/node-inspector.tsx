"use client";

import { AiRewrite } from "@/components/flow-canvas/ai-rewrite";
import { MediaPicker } from "@/components/flow-canvas/media-picker";
import { NODE_TONE } from "@/components/flow-canvas/node-colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SplitTrafficEditor } from "@/components/flow-canvas/split-traffic-editor";
import {
  MAX_GALLERY_CARDS,
  MAX_MESSAGE_BLOCKS,
  MAX_QUICK_REPLIES,
  MAX_TYPING_DELAY_SECONDS,
  blockLabel,
  isMediaBlock,
  messageNodeButtons,
  newBlockId,
  nextButtonHandleId,
  nextQuickReplyHandleId,
  TRIGGER_NODE_ID,
  type CanvasButton,
  type CanvasCard,
  type CanvasNodeData,
  type MessageBlock,
  type SendMessageData,
} from "@/lib/flow-canvas";
import type {
  CaptureField,
  ConditionOp,
  ConditionRule,
  FormField,
  HttpMethod,
  ReplyType,
  SetFieldMode,
  SubscribeAction,
  TagAction,
  TriggerType,
} from "@/lib/types";
import { TRIGGER_OPTIONS } from "@/lib/types";
import { isSocialTrigger, type SocialTriggerConfig } from "@/lib/social-triggers";

export type InspectorFlowOption = { id: string; name: string };

export type InspectorField = { key: string; label: string };

export type FlowMeta = {
  name: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  isActive: boolean;
  trigger?: SocialTriggerConfig;
};

function parseCaptureSelect(value: string, customKey: string): CaptureField {
  if (value === "name" || value === "email" || value === "phone") return value;
  const key = customKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") || "company";
  return `custom:${key}`;
}

function triggerMatchPlaceholder(type: TriggerType) {
  if (type === "intent") return "Asking about shipping or delivery times";
  if (type === "command") return "/help";
  if (type === "start_param") return "promo";
  if (type === "keyword_contains") return "price, cost";
  if (type === "keyword_word") return "like";
  if (type === "keyword_starts_with") return "can you";
  if (type === "keyword_not_contains") return "refund";
  if (isSocialTrigger(type)) return "Any (or: guide, link, price)";
  return "hello, hi";
}

function triggerNeedsValue(type: TriggerType) {
  return type !== "start" && type !== "default" && type !== "story_mention";
}

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** Comment automation settings: which posts, the public reply pool, and repeat handling. */
export function SocialTriggerEditor({
  type,
  config,
  onChange,
}: {
  type: TriggerType;
  config: SocialTriggerConfig | undefined;
  onChange: (next: SocialTriggerConfig) => void;
}) {
  const value = config ?? {};
  if (type === "story_reply") {
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        Fires when someone replies to your Instagram story. Leave Match empty for every reply, or list keywords.
        Unmatched story replies fall through to your keyword rules.
      </p>
    );
  }
  if (type === "story_mention") {
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        Fires when someone mentions your account in their story. Thank them, tag them, or send a reward.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Posts</Label>
        <Textarea
          rows={2}
          value={(value.postIds ?? []).join("\n")}
          placeholder={"Every post\n(or one post id / link per line)"}
          onChange={(event) => onChange({ ...value, postIds: lines(event.target.value) })}
        />
      </div>
      <div className="space-y-1">
        <Label>Public replies</Label>
        <Textarea
          rows={3}
          value={(value.publicReplies ?? []).join("\n")}
          placeholder={"Sent you a DM {{first_name}}! 📩\nCheck your inbox 👀"}
          onChange={(event) => onChange({ ...value, publicReplies: lines(event.target.value) })}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          One per line. Relay picks one at random so replies do not look automated.
        </p>
        <label className="flex items-center gap-2 pt-1 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value.aiPublicReply)}
            onChange={(event) => onChange({ ...value, aiPublicReply: event.target.checked || undefined })}
          />
          ✨ Let AI write each reply
        </label>
        {value.aiPublicReply ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Claude replies to what each person actually said, in your brand voice, styled after the lines above (which are
            also the fallback).
          </p>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.oncePerContact ?? true}
          onChange={(event) => onChange({ ...value, oncePerContact: event.target.checked })}
        />
        Once per person per post
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.excludeReplies ?? false}
          onChange={(event) => onChange({ ...value, excludeReplies: event.target.checked })}
        />
        Ignore replies to other comments
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.hideAfterReply ?? false}
          onChange={(event) => onChange({ ...value, hideAfterReply: event.target.checked })}
        />
        Hide the comment after replying
      </label>
      <p className="text-[11px] leading-snug text-muted-foreground">
        The first message goes out as a private reply to the comment — Instagram allows one until the person
        answers, so give it a button and continue the flow from the tap.
      </p>
    </div>
  );
}

export function NodeInspector({
  selectedId,
  data,
  meta,
  customFields,
  tagNames,
  otherFlows,
  onMetaChange,
  onDataChange,
  onDelete,
}: {
  selectedId: string | null;
  data: CanvasNodeData | null;
  meta: FlowMeta;
  customFields: InspectorField[];
  tagNames: string[];
  otherFlows: InspectorFlowOption[];
  onMetaChange: (patch: Partial<FlowMeta>) => void;
  onDataChange: (id: string, data: CanvasNodeData) => void;
  onDelete: (id: string) => void;
}) {
  if (!selectedId || !data) {
    return (
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l bg-sidebar/60 p-4 md:block">
        <p className="text-sm font-medium">Properties</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a node to edit it. The trigger sets when this flow starts.
        </p>
      </aside>
    );
  }

  const isTrigger = selectedId === TRIGGER_NODE_ID;
  const param = (meta.triggerValue ?? "").trim() || "promo";

  return (
    <aside className="max-h-[42vh] w-full shrink-0 overflow-y-auto border-t bg-sidebar/80 p-4 md:max-h-none md:w-80 md:border-t-0 md:border-l">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium capitalize">
            <span className="size-2.5 rounded-full" style={{ background: NODE_TONE[data.kind].hex }} />
            {data.kind === "send_message" ? "Send Message" : data.kind.replace(/_/g, " ")}
          </p>
          <p className="text-[11px] text-muted-foreground">{isTrigger ? "Flow start" : selectedId}</p>
        </div>
        {!isTrigger ? (
          <Button size="xs" variant="ghost" onClick={() => onDelete(selectedId)}>
            Remove
          </Button>
        ) : null}
      </div>

      {isTrigger ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={meta.name} onChange={(event) => onMetaChange({ name: event.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>When</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={meta.triggerType}
              onChange={(event) => onMetaChange({ triggerType: event.target.value as TriggerType })}
            >
              {TRIGGER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {triggerNeedsValue(meta.triggerType) ? (
            <div className="space-y-1">
              <Label>{meta.triggerType === "start_param" ? "Start payload" : meta.triggerType === "intent" ? "When someone is…" : "Match"}</Label>
              <Input
                value={meta.triggerValue ?? ""}
                onChange={(event) => onMetaChange({ triggerValue: event.target.value })}
                placeholder={triggerMatchPlaceholder(meta.triggerType)}
              />
            </div>
          ) : null}
          {isSocialTrigger(meta.triggerType) ? (
            <SocialTriggerEditor
              type={meta.triggerType}
              config={meta.trigger}
              onChange={(trigger) => onMetaChange({ trigger })}
            />
          ) : null}
          {meta.triggerType === "start" ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              ManyChat Welcome Message: fires on the first /start only. Later /start is ignored. Growth-link payloads still run.
            </p>
          ) : null}
          {meta.triggerType === "intent" ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Describe what the person wants in plain words. When a message matches no keyword, Claude reads it and starts
              this flow if it fits — no exact wording needed, any language.
            </p>
          ) : null}
          {meta.triggerType === "default" ? (
            <div className="space-y-1">
              <Label>How often</Label>
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={meta.trigger?.defaultFrequency ?? "always"}
                onChange={(event) =>
                  onMetaChange({ trigger: { ...(meta.trigger ?? {}), defaultFrequency: event.target.value === "daily" ? "daily" : "always" } })
                }
              >
                <option value="always">Every time</option>
                <option value="daily">Once per 24 hours per person</option>
              </select>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Runs when a message does not match /start, a command, a keyword or an AI intent.
              </p>
            </div>
          ) : null}
          {meta.triggerType.startsWith("keyword") ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Comma-separate up to 10 keywords. Priority is the Keywords tab list order.
            </p>
          ) : null}
          {meta.triggerType === "start_param" ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Share <span className="font-medium">t.me/&lt;bot&gt;?start={param}</span>. Telegram sends{" "}
              <span className="font-medium">/start {param}</span>, which starts this flow.
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={meta.isActive}
              onChange={(event) => onMetaChange({ isActive: event.target.checked })}
            />
            Active
          </label>
        </div>
      ) : null}

      {data.kind === "send_message" ? (
        <SendMessageEditor data={data} onChange={(next) => onDataChange(selectedId, next)} />
      ) : null}

      {data.kind === "message" || data.kind === "media" ? (
        <div className="space-y-3">
          <MediaPicker
            value={data.media}
            onChange={(media) => onDataChange(selectedId, { ...data, media })}
          />
          <div className="space-y-1">
            <Label>{data.kind === "media" ? "Caption" : "Telegram text"}</Label>
            <Textarea
              rows={data.kind === "media" ? 4 : 6}
              value={data.text}
              onChange={(event) => onDataChange(selectedId, { ...data, text: event.target.value })}
            />
          </div>
        </div>
      ) : null}

      {data.kind === "note" ? (
        <div className="space-y-1">
          <Label>Note</Label>
          <Textarea rows={8} value={data.text} onChange={(event) => onDataChange(selectedId, { ...data, text: event.target.value })} />
          <p className="text-[11px] text-muted-foreground">Only your team sees notes. They never run or send anything.</p>
        </div>
      ) : null}

      {data.kind === "gallery" ? (
        <GalleryEditor data={data} onChange={(next) => onDataChange(selectedId, next)} />
      ) : null}

      {data.kind === "buttons" ? (
        <ButtonsEditor data={data} onChange={(next) => onDataChange(selectedId, next)} />
      ) : null}

      {data.kind === "capture" ? (
        <CaptureEditor
          data={data}
          customFields={customFields}
          onChange={(next) => onDataChange(selectedId, next)}
        />
      ) : null}

      {data.kind === "form" ? (
        <FormEditor data={data} customFields={customFields} onChange={(next) => onDataChange(selectedId, next)} />
      ) : null}

      {data.kind === "set_field" ? (
        <div className="space-y-3">
          <FieldSelect
            field={data.field}
            customFields={customFields}
            onChange={(field) => onDataChange(selectedId, { ...data, field })}
          />
          <div className="space-y-1">
            <Label>Action</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={data.mode ?? "set"}
              onChange={(event) => onDataChange(selectedId, { ...data, mode: event.target.value as SetFieldMode })}
            >
              <option value="set">Set to</option>
              <option value="add">Increase by (number)</option>
              <option value="subtract">Decrease by (number)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>{data.mode === "add" || data.mode === "subtract" ? "Amount" : "Value"}</Label>
            <Input
              value={data.value}
              inputMode={data.mode === "add" || data.mode === "subtract" ? "decimal" : undefined}
              onChange={(event) => onDataChange(selectedId, { ...data, value: event.target.value })}
              placeholder={data.mode === "add" || data.mode === "subtract" ? "1" : "Written onto the contact"}
            />
            <p className="text-[11px] text-muted-foreground">
              {data.mode === "add" || data.mode === "subtract"
                ? "Great for lead scores and counters. A blank field counts as 0."
                : "Empty clears the field. To ask the contact, use User input or a lead form."}
            </p>
          </div>
        </div>
      ) : null}

      {data.kind === "tag" ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Action</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={data.action}
              onChange={(event) =>
                onDataChange(selectedId, { ...data, action: event.target.value as TagAction })
              }
            >
              <option value="add">Add tag</option>
              <option value="remove">Remove tag</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Tag name</Label>
            <Input
              list="relay-tag-names"
              value={data.tagName}
              onChange={(event) => onDataChange(selectedId, { ...data, tagName: event.target.value })}
            />
            <datalist id="relay-tag-names">
              {tagNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>
      ) : null}

      {data.kind === "subscribe" ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Action</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={data.action}
              onChange={(event) =>
                onDataChange(selectedId, { ...data, action: event.target.value as SubscribeAction })
              }
            >
              <option value="subscribe">Subscribe</option>
              <option value="unsubscribe">Unsubscribe</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>List</Label>
            <Input
              value={data.listName}
              onChange={(event) => onDataChange(selectedId, { ...data, listName: event.target.value })}
              placeholder={data.action === "unsubscribe" ? "newsletter or all" : "newsletter"}
            />
            <p className="text-[11px] text-muted-foreground">
              Subscribe also adds a matching tag so broadcasts can target the list. Unsubscribe from{" "}
              <span className="font-medium">all</span> skips every future broadcast.
            </p>
          </div>
        </div>
      ) : null}

      {data.kind === "delay" ? (
        <DelayEditor data={data} onChange={(next) => onDataChange(selectedId, next)} />
      ) : null}

      {data.kind === "randomizer" ? (
        <RandomizerEditor data={data} onChange={(next) => onDataChange(selectedId, next)} />
      ) : null}

      {data.kind === "condition" ? (
        <ConditionEditor
          data={data}
          customFields={customFields}
          tagNames={tagNames}
          onChange={(next) => onDataChange(selectedId, next)}
        />
      ) : null}

      {data.kind === "start_flow" ? (
        <div className="space-y-1">
          <Label>Flow to start</Label>
          <select
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={data.flowId}
            onChange={(event) => onDataChange(selectedId, { ...data, flowId: event.target.value })}
          >
            <option value="">Choose a flow</option>
            {otherFlows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Jumps into that flow immediately. Connect Next only as a fallback if the target is missing.
          </p>
        </div>
      ) : null}

      {data.kind === "http" ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Method</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={data.method}
              onChange={(event) =>
                onDataChange(selectedId, { ...data, method: event.target.value as HttpMethod })
              }
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>HTTPS URL</Label>
            <Input
              value={data.url}
              onChange={(event) => onDataChange(selectedId, { ...data, url: event.target.value })}
              placeholder="https://hooks.zapier.com/..."
            />
          </div>
          {data.method === "POST" ? (
            <div className="space-y-1">
              <Label>JSON body</Label>
              <Textarea
                rows={5}
                value={data.body}
                onChange={(event) => onDataChange(selectedId, { ...data, body: event.target.value })}
                placeholder='{"email":"{{email}}","name":"{{name}}"}'
              />
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            Templates: {"{{name}}"} {"{{email}}"} {"{{phone}}"} {"{{telegram_id}}"} {"{{field:company}}"}
          </p>
        </div>
      ) : null}

      {data.kind === "notify" ? (
        <div className="space-y-1">
          <Label>Admin message</Label>
          <Textarea
            rows={5}
            value={data.text}
            onChange={(event) => onDataChange(selectedId, { ...data, text: event.target.value })}
            placeholder="New lead: {{name}} {{email}}"
          />
          <p className="text-[11px] text-muted-foreground">
            Written to the inbox. Also sent to ADMIN_TELEGRAM_CHAT_ID when that env var is set.
          </p>
        </div>
      ) : null}

      {data.kind === "goal" ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Goal name</Label>
            <Input value={data.name} onChange={(event) => onDataChange(selectedId, { ...data, name: event.target.value })} placeholder="Booked a call" />
          </div>
          <div className="space-y-1">
            <Label>Value (optional)</Label>
            <Input
              inputMode="decimal"
              value={data.value}
              onChange={(event) => onDataChange(selectedId, { ...data, value: event.target.value })}
              placeholder="49.00"
            />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Counts a conversion each time someone reaches this step. Values add up to revenue on the Flows page and
            dashboard. Purchases from your store can also be reported with the API.
          </p>
        </div>
      ) : null}

      {data.kind === "ai" ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Goal</Label>
            <Textarea
              rows={4}
              value={data.goal}
              onChange={(event) => onDataChange(selectedId, { ...data, goal: event.target.value })}
              placeholder="Qualify the lead: find out their budget and timeline, then offer a call"
            />
          </div>
          <div className="space-y-1">
            <Label>Collect</Label>
            <Input
              value={data.collect}
              onChange={(event) => onDataChange(selectedId, { ...data, collect: event.target.value })}
              placeholder="email, phone, budget"
            />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Claude chats with the contact using your AI persona and knowledge (Settings → AI) until the goal is met,
            saving what it collects to their profile. Then the flow continues from the right handle. If it cannot help,
            it hands the conversation to your team and pauses the bot.
          </p>
        </div>
      ) : null}

      {data.kind === "end" ? (
        <div className="space-y-1">
          <Label>Closing text</Label>
          <Textarea
            rows={5}
            value={data.text ?? ""}
            onChange={(event) => onDataChange(selectedId, { ...data, text: event.target.value })}
            placeholder="Optional last message"
          />
        </div>
      ) : null}
    </aside>
  );
}

function ButtonListEditor({
  buttons,
  allButtons,
  onChange,
}: {
  buttons: CanvasButton[];
  /** Every button on the node, so new handle ids stay unique across blocks. */
  allButtons: CanvasButton[];
  onChange: (buttons: CanvasButton[]) => void;
}) {
  const updateButton = (index: number, patch: Partial<CanvasButton>) => {
    onChange(
      buttons.map((button, i) => {
        if (i !== index) return button;
        const next = { ...button, ...patch };
        if (patch.url !== undefined) {
          const url = patch.url.trim();
          if (url) next.url = url;
          else delete next.url;
        }
        return next;
      }),
    );
  };

  return (
    <div className="space-y-1.5">
      {buttons.map((button, index) => (
        <div key={button.id} className="space-y-1 rounded-md border border-border bg-background p-2">
          <div className="flex gap-2">
            <Input
              value={button.text}
              onChange={(event) => updateButton(index, { text: event.target.value })}
              placeholder="Button label"
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Remove button"
              onClick={() => onChange(buttons.filter((_, i) => i !== index))}
            >
              ×
            </Button>
          </div>
          <Input
            value={button.url ?? ""}
            onChange={(event) => updateButton(index, { url: event.target.value })}
            placeholder="Go to step (connect on canvas) or https:// URL"
          />
          {/buy\.stripe\.com/i.test(button.url ?? "") && !/client_reference_id/i.test(button.url ?? "") ? (
            <button
              type="button"
              className="text-left text-[11px] text-[#635bff] hover:underline"
              onClick={() => updateButton(index, { url: `${button.url}${button.url!.includes("?") ? "&" : "?"}client_reference_id={{contact_id}}` })}
            >
              💳 Stripe link: add the contact id so the purchase is credited to this flow
            </button>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => onChange([...buttons, { id: nextButtonHandleId(allButtons), text: "Continue" }])}
      >
        + Button
      </Button>
    </div>
  );
}

const FORMATTING_HINT = "Formatting: **bold**, __italic__, ~~strike~~, `code`, [link](https://…). Variables: {{name}}, {{email}}, {{field:key}}.";

function pickerKind(type: MessageBlock["type"]) {
  if (type === "video") return "video" as const;
  if (type === "audio") return "audio" as const;
  if (type === "file") return "document" as const;
  return "photo" as const;
}

function SendMessageEditor({
  data,
  onChange,
}: {
  data: SendMessageData;
  onChange: (data: SendMessageData) => void;
}) {
  const allButtons = messageNodeButtons(data);

  const updateBlock = (index: number, block: MessageBlock) => {
    onChange({ ...data, blocks: data.blocks.map((item, i) => (i === index ? block : item)) });
  };

  const moveBlock = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= data.blocks.length) return;
    const blocks = data.blocks.slice();
    const [moved] = blocks.splice(index, 1);
    blocks.splice(target, 0, moved!);
    onChange({ ...data, blocks });
  };

  const addBlock = (type: MessageBlock["type"]) => {
    if (data.blocks.length >= MAX_MESSAGE_BLOCKS) return;
    const id = newBlockId();
    const block: MessageBlock =
      type === "text"
        ? { id, type: "text", text: "", buttons: [] }
        : type === "delay"
          ? { id, type: "delay", seconds: 2 }
          : { id, type, text: "", buttons: [] };
    onChange({ ...data, blocks: [...data.blocks, block] });
  };

  const updateQuickReply = (index: number, text: string) => {
    onChange({
      ...data,
      quickReplies: data.quickReplies.map((reply, i) => (i === index ? { ...reply, text } : reply)),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-snug text-muted-foreground">
        ManyChat-style message: stack text, image, and typing-delay blocks. Every block is sent in order; buttons and
        quick replies each get their own connector on the canvas.
      </p>

      <div className="space-y-2">
        {data.blocks.map((block, index) => (
          <div key={block.id} className="space-y-2 rounded-lg border border-border p-2.5">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-medium">{blockLabel(block.type)}</p>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Move block up"
                  disabled={index === 0}
                  onClick={() => moveBlock(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Move block down"
                  disabled={index === data.blocks.length - 1}
                  onClick={() => moveBlock(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Remove block"
                  onClick={() => onChange({ ...data, blocks: data.blocks.filter((_, i) => i !== index) })}
                >
                  ×
                </Button>
              </div>
            </div>

            {block.type === "delay" ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={MAX_TYPING_DELAY_SECONDS}
                  className="w-24"
                  value={block.seconds}
                  onChange={(event) =>
                    updateBlock(index, {
                      ...block,
                      seconds: Math.max(
                        0,
                        Math.min(MAX_TYPING_DELAY_SECONDS, Number.parseInt(event.target.value, 10) || 0),
                      ),
                    })
                  }
                />
                <span className="text-xs text-muted-foreground">seconds before the next block</span>
              </div>
            ) : (
              <>
                {isMediaBlock(block) ? (
                  <MediaPicker
                    kind={pickerKind(block.type)}
                    value={block.media}
                    onChange={(media) => updateBlock(index, { ...block, media })}
                  />
                ) : null}
                <Textarea
                  rows={isMediaBlock(block) ? 3 : 5}
                  placeholder={isMediaBlock(block) ? "Caption (optional)" : "Message text — {{name}} works here"}
                  value={block.text}
                  onChange={(event) => updateBlock(index, { ...block, text: event.target.value })}
                />
                <AiRewrite text={block.text} onChange={(text) => updateBlock(index, { ...block, text })} />
                <p className="text-[11px] leading-snug text-muted-foreground">{FORMATTING_HINT}</p>
                <div className="space-y-1">
                  <Label className="text-[11px]">Buttons</Label>
                  <ButtonListEditor
                    buttons={block.buttons}
                    allButtons={allButtons}
                    onChange={(buttons) => updateBlock(index, { ...block, buttons })}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {data.blocks.length < MAX_MESSAGE_BLOCKS ? (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("text")}>
            + Text
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("image")}>
            + Image
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("video")}>
            + Video
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("audio")}>
            + Audio
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("file")}>
            + File
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("delay")}>
            + Delay
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5 border-t pt-3">
        <Label>Quick replies</Label>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Shown as a Telegram reply keyboard under the input. The flow waits for a tap; connect each reply to its next
          step.
        </p>
        {data.quickReplies.map((reply, index) => (
          <div key={reply.id} className="flex gap-2">
            <Input
              value={reply.text}
              placeholder="Quick reply label"
              onChange={(event) => updateQuickReply(index, event.target.value)}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Remove quick reply"
              onClick={() => onChange({ ...data, quickReplies: data.quickReplies.filter((_, i) => i !== index) })}
            >
              ×
            </Button>
          </div>
        ))}
        {data.quickReplies.length < MAX_QUICK_REPLIES ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() =>
              onChange({
                ...data,
                quickReplies: [
                  ...data.quickReplies,
                  { id: nextQuickReplyHandleId(data.quickReplies), text: "" },
                ],
              })
            }
          >
            + Quick reply
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function GalleryEditor({
  data,
  onChange,
}: {
  data: Extract<CanvasNodeData, { kind: "gallery" }>;
  onChange: (data: Extract<CanvasNodeData, { kind: "gallery" }>) => void;
}) {
  const allButtons = data.cards.flatMap((card) => card.buttons);
  const updateCard = (index: number, patch: Partial<CanvasCard>) =>
    onChange({ ...data, cards: data.cards.map((card, i) => (i === index ? { ...card, ...patch } : card)) });
  const move = (index: number, delta: number) => {
    const cards = [...data.cards];
    const [card] = cards.splice(index, 1);
    cards.splice(Math.max(0, Math.min(cards.length, index + delta)), 0, card!);
    onChange({ ...data, cards });
  };
  const addCard = () => {
    const used = new Set(data.cards.map((card) => card.id));
    let n = data.cards.length;
    while (used.has(`card-${n}`)) n += 1;
    onChange({
      ...data,
      cards: [...data.cards, { id: `card-${n}`, title: "New card", subtitle: "", imageUrl: "", url: "", buttons: [{ id: nextButtonHandleId(allButtons), text: "Choose" }] }],
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Intro text (optional)</Label>
        <Textarea rows={2} value={data.text} placeholder="Here are our plans 👇" onChange={(event) => onChange({ ...data, text: event.target.value })} />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        A swipeable carousel on Instagram and Messenger; one message per card on other networks. Up to {MAX_GALLERY_CARDS} cards, 3 buttons each.
      </p>
      {data.cards.map((card, index) => (
        <div key={card.id} className="space-y-2 rounded-lg border border-border p-2.5">
          <div className="flex items-center gap-1">
            <p className="flex-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Card {index + 1}</p>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Move card up" disabled={index === 0} onClick={() => move(index, -1)}>
              ↑
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Move card down" disabled={index === data.cards.length - 1} onClick={() => move(index, 1)}>
              ↓
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Remove card"
              onClick={() => onChange({ ...data, cards: data.cards.filter((_, i) => i !== index) })}
            >
              ×
            </Button>
          </div>
          <MediaPicker
            value={card.imageUrl ? { url: card.imageUrl, kind: "photo" } : undefined}
            onChange={(media) => updateCard(index, { imageUrl: media?.url ?? "" })}
          />
          <Input value={card.title} placeholder="Title" onChange={(event) => updateCard(index, { title: event.target.value })} />
          <Input value={card.subtitle} placeholder="Subtitle (price, short pitch)" onChange={(event) => updateCard(index, { subtitle: event.target.value })} />
          <Input value={card.url} placeholder="Open https:// link when the card is tapped" onChange={(event) => updateCard(index, { url: event.target.value })} />
          <ButtonListEditor
            buttons={card.buttons}
            allButtons={allButtons}
            onChange={(buttons) => updateCard(index, { buttons: buttons.slice(0, 3) })}
          />
        </div>
      ))}
      {data.cards.length < MAX_GALLERY_CARDS ? (
        <Button type="button" size="xs" variant="outline" onClick={addCard}>
          + Card
        </Button>
      ) : null}
    </div>
  );
}

function ButtonsEditor({
  data,
  onChange,
}: {
  data: Extract<CanvasNodeData, { kind: "buttons" }>;
  onChange: (data: Extract<CanvasNodeData, { kind: "buttons" }>) => void;
}) {
  const updateButton = (index: number, patch: Partial<CanvasButton>) => {
    const buttons = data.buttons.map((button, i) => {
      if (i !== index) return button;
      const next = { ...button, ...patch };
      if (patch.url !== undefined) {
        const url = patch.url.trim();
        if (url) next.url = url;
        else delete next.url;
      }
      return next;
    });
    onChange({ ...data, buttons });
  };

  const removeButton = (index: number) => {
    onChange({ ...data, buttons: data.buttons.filter((_, i) => i !== index) });
  };

  const addButton = () => {
    const buttons: CanvasButton[] = [
      ...data.buttons,
      { id: nextButtonHandleId(data.buttons), text: "Continue" },
    ];
    onChange({ ...data, buttons });
  };

  return (
    <div className="space-y-3">
      <MediaPicker value={data.media} onChange={(media) => onChange({ ...data, media })} />
      <div className="space-y-1">
        <Label>Prompt</Label>
        <Textarea
          rows={4}
          value={data.text}
          onChange={(event) => onChange({ ...data, text: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Buttons</Label>
        {data.buttons.map((button, index) => (
          <div key={button.id} className="space-y-1 rounded-lg border border-border p-2">
            <div className="flex gap-2">
              <Input
                value={button.text}
                onChange={(event) => updateButton(index, { text: event.target.value })}
                placeholder="Label"
              />
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeButton(index)}>
                ×
              </Button>
            </div>
            <Input
              value={button.url ?? ""}
              onChange={(event) => updateButton(index, { url: event.target.value })}
              placeholder="Optional https:// URL"
            />
            {button.url ? (
              <p className="text-[11px] text-muted-foreground">URL buttons open a link and do not branch.</p>
            ) : null}
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={addButton}>
          Add button
        </Button>
      </div>
    </div>
  );
}

function FieldSelect({
  field,
  customFields,
  onChange,
}: {
  field: CaptureField;
  customFields: InspectorField[];
  onChange: (field: CaptureField) => void;
}) {
  const isCustom = field.startsWith("custom:");
  const customKey = isCustom ? field.slice("custom:".length) : customFields[0]?.key ?? "company";
  const selectValue = isCustom ? "custom" : field;

  return (
    <>
      <div className="space-y-1">
        <Label>Write to</Label>
        <select
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={selectValue}
          onChange={(event) => onChange(parseCaptureSelect(event.target.value, customKey))}
        >
          <option value="name">Name</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="custom">Custom field</option>
        </select>
      </div>
      {isCustom ? (
        <div className="space-y-1">
          <Label>Custom key</Label>
          {customFields.length > 0 ? (
            <select
              className="mb-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={customFields.some((item) => item.key === customKey) ? customKey : ""}
              onChange={(event) => onChange(parseCaptureSelect("custom", event.target.value))}
            >
              <option value="" disabled>
                Choose a field
              </option>
              {customFields.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : null}
          <Input
            value={customKey}
            onChange={(event) => onChange(parseCaptureSelect("custom", event.target.value))}
            placeholder="company"
          />
        </div>
      ) : null}
    </>
  );
}

function CaptureEditor({
  data,
  customFields,
  onChange,
}: {
  data: Extract<CanvasNodeData, { kind: "capture" }>;
  customFields: InspectorField[];
  onChange: (data: Extract<CanvasNodeData, { kind: "capture" }>) => void;
}) {
  return (
    <div className="space-y-3">
      <FieldSelect
        field={data.field}
        customFields={customFields}
        onChange={(field) => {
          const next = { ...data, field };
          // Reply types only apply to custom fields; do not leave a stale "Number" on an email question.
          if (!field.startsWith("custom:")) {
            delete next.replyType;
            delete next.retryMessage;
          }
          onChange(next);
        }}
      />
      <div className="space-y-1">
        <Label>Prompt</Label>
        <Textarea
          rows={4}
          value={data.prompt}
          onChange={(event) => onChange({ ...data, prompt: event.target.value })}
        />
      </div>
      {data.field.startsWith("custom:") ? (
        <div className="space-y-1">
          <Label>Reply type</Label>
          <select
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={data.replyType ?? "text"}
            onChange={(event) => onChange({ ...data, replyType: event.target.value as ReplyType })}
          >
            <option value="text">Any text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="url">Link (URL)</option>
          </select>
          {data.replyType && data.replyType !== "text" ? (
            <Input
              value={data.retryMessage ?? ""}
              placeholder="If it doesn't fit, say… (optional)"
              onChange={(event) => onChange({ ...data, retryMessage: event.target.value })}
            />
          ) : null}
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(data.skippable)}
          onChange={(event) => {
            const next = { ...data };
            if (event.target.checked) next.skippable = true;
            else delete next.skippable;
            onChange(next);
          }}
        />
        Show a Skip button
      </label>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {data.field === "phone"
          ? "Phone questions add a Telegram “Share my phone number” button, so the contact taps instead of typing."
          : "Like ManyChat, Skip lets the contact continue without answering."}
      </p>
    </div>
  );
}

function FormEditor({
  data,
  customFields,
  onChange,
}: {
  data: Extract<CanvasNodeData, { kind: "form" }>;
  customFields: InspectorField[];
  onChange: (data: Extract<CanvasNodeData, { kind: "form" }>) => void;
}) {
  const updateField = (index: number, patch: Partial<FormField>) => {
    const fields = data.fields.map((field, i) => (i === index ? { ...field, ...patch } : field));
    onChange({ ...data, fields });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Intro</Label>
        <Textarea
          rows={3}
          value={data.intro}
          onChange={(event) => onChange({ ...data, intro: event.target.value })}
          placeholder="Optional first message before the questions"
        />
      </div>
      <div className="space-y-2">
        <Label>Questions</Label>
        {data.fields.map((field, index) => (
          <div key={`${field.field}-${index}`} className="space-y-2 rounded-lg border border-border p-2">
            <FieldSelect
              field={field.field}
              customFields={customFields}
              onChange={(next) => updateField(index, { field: next })}
            />
            <Textarea
              rows={2}
              value={field.prompt}
              onChange={(event) => updateField(index, { prompt: event.target.value })}
              placeholder="Prompt"
            />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => onChange({ ...data, fields: data.fields.filter((_, i) => i !== index) })}
            >
              Remove question
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...data,
              fields: [...data.fields, { field: "email", prompt: "What's the best email?" }],
            })
          }
        >
          Add question
        </Button>
      </div>
    </div>
  );
}

function DelayEditor({
  data,
  onChange,
}: {
  data: Extract<CanvasNodeData, { kind: "delay" }>;
  onChange: (data: Extract<CanvasNodeData, { kind: "delay" }>) => void;
}) {
  const unit = data.unit ?? "seconds";
  const factor = unit === "days" ? 86400 : unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1;
  const amount = Math.round((data.seconds || 0) / factor) || 0;
  const presets = [
    { label: "Now", seconds: 0 },
    { label: "5m", seconds: 300 },
    { label: "1h", seconds: 3600 },
    { label: "1d", seconds: 86400 },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Wait</Label>
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={(event) =>
              onChange({
                ...data,
                unit,
                seconds: Math.max(0, Number.parseInt(event.target.value, 10) || 0) * factor,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Unit</Label>
          <select
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={unit}
            onChange={(event) => {
              const next = event.target.value as NonNullable<typeof data.unit>;
              const nextFactor = next === "days" ? 86400 : next === "hours" ? 3600 : next === "minutes" ? 60 : 1;
              onChange({ ...data, unit: next, seconds: amount * nextFactor });
            }}
          >
            <option value="seconds">Seconds</option>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="xs"
            variant={data.seconds === preset.seconds ? "default" : "outline"}
            onClick={() => onChange({ ...data, seconds: preset.seconds, unit: "seconds" })}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Send after</Label>
          <Input
            type="time"
            value={data.sendAfter ?? ""}
            onChange={(event) => onChange({ ...data, sendAfter: event.target.value || undefined })}
          />
        </div>
        <div className="space-y-1">
          <Label>Send before</Label>
          <Input
            type="time"
            value={data.sendBefore ?? ""}
            onChange={(event) => onChange({ ...data, sendBefore: event.target.value || undefined })}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        ManyChat Smart Delay: minutes/hours/days, plus an optional continue-between window.
      </p>
    </div>
  );
}

function RandomizerEditor({
  data,
  onChange,
}: {
  data: Extract<CanvasNodeData, { kind: "randomizer" }>;
  onChange: (data: Extract<CanvasNodeData, { kind: "randomizer" }>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-snug text-muted-foreground">
        ManyChat A/B split: send X% of contacts down one path and the rest down another. Drag a slider or type a
        percent — the other paths rebalance to 100%.
      </p>
      <SplitTrafficEditor
        paths={data.paths}
        onChange={(paths) => onChange({ ...data, paths })}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!data.sticky}
          onChange={(event) => onChange({ ...data, sticky: !event.target.checked })}
        />
        Random path every time
      </label>
      <p className="text-[11px] text-muted-foreground">
        Leave unchecked so a contact stays on the same variant if they hit this split again.
      </p>
    </div>
  );
}

function RuleEditor({
  rule,
  customFields,
  tagNames,
  onChange,
}: {
  rule: ConditionRule;
  customFields: InspectorField[];
  tagNames: string[];
  onChange: (rule: ConditionRule) => void;
}) {
  const op = rule.op ?? "set";
  return (
    <div className="space-y-2">
      <select
        aria-label="Check"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        value={rule.check === "field" ? "field" : `${rule.check}:${op === "not_set" ? "no" : "yes"}`}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "field") onChange({ ...rule, check: "field", op: "set" });
          else {
            const [check, polarity] = value.split(":");
            onChange({ ...rule, check: check === "subscription" ? "subscription" : "tag", op: polarity === "no" ? "not_set" : "set" });
          }
        }}
      >
        <option value="tag:yes">Has tag</option>
        <option value="tag:no">Doesn&apos;t have tag</option>
        <option value="subscription:yes">Subscribed to list</option>
        <option value="subscription:no">Not subscribed to list</option>
        <option value="field">Field value</option>
      </select>
      {rule.check === "tag" || rule.check === "subscription" ? (
        <>
          <Input
            list="relay-condition-tags"
            aria-label={rule.check === "subscription" ? "List name" : "Tag name"}
            placeholder={rule.check === "subscription" ? "List name (or all)" : "Tag name"}
            value={rule.tagName ?? ""}
            onChange={(event) => onChange({ ...rule, tagName: event.target.value })}
          />
          <datalist id="relay-condition-tags">
            {tagNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>
      ) : (
        <>
          <FieldSelect field={rule.field ?? "email"} customFields={customFields} onChange={(field) => onChange({ ...rule, field })} />
          <select
            aria-label="Operator"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={op}
            onChange={(event) => onChange({ ...rule, op: event.target.value as ConditionOp })}
          >
            <option value="set">Is set</option>
            <option value="not_set">Is empty</option>
            <option value="eq">Equals</option>
            <option value="neq">Doesn&apos;t equal</option>
            <option value="contains">Contains</option>
            <option value="not_contains">Doesn&apos;t contain</option>
            <option value="gt">Greater than (number)</option>
            <option value="lt">Less than (number)</option>
          </select>
          {op !== "set" && op !== "not_set" ? (
            <Input aria-label="Value" placeholder="Value" value={rule.value ?? ""} onChange={(event) => onChange({ ...rule, value: event.target.value })} />
          ) : null}
        </>
      )}
    </div>
  );
}

function ConditionEditor({
  data,
  customFields,
  tagNames,
  onChange,
}: {
  data: Extract<CanvasNodeData, { kind: "condition" }>;
  customFields: InspectorField[];
  tagNames: string[];
  onChange: (data: Extract<CanvasNodeData, { kind: "condition" }>) => void;
}) {
  const extra = data.extra ?? [];
  const setExtra = (next: ConditionRule[]) => onChange({ ...data, extra: next, match: data.match ?? "all" });
  return (
    <div className="space-y-3">
      <RuleEditor
        rule={data}
        customFields={customFields}
        tagNames={tagNames}
        onChange={(rule) =>
          onChange({
            ...data,
            check: rule.check,
            tagName: rule.tagName ?? data.tagName,
            field: rule.field ?? data.field,
            op: rule.op ?? "set",
            value: rule.value ?? data.value,
          })
        }
      />
      {extra.map((rule, index) => (
        <div key={index} className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <select
              aria-label="Combine rules"
              className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium uppercase"
              value={data.match ?? "all"}
              onChange={(event) => onChange({ ...data, match: event.target.value === "any" ? "any" : "all" })}
            >
              <option value="all">And</option>
              <option value="any">Or</option>
            </select>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove rule" onClick={() => setExtra(extra.filter((_, i) => i !== index))}>
              ×
            </Button>
          </div>
          <RuleEditor
            rule={rule}
            customFields={customFields}
            tagNames={tagNames}
            onChange={(next) => setExtra(extra.map((item, i) => (i === index ? next : item)))}
          />
        </div>
      ))}
      {extra.length < 9 ? (
        <Button type="button" size="xs" variant="outline" onClick={() => setExtra([...extra, { check: "tag", tagName: "", op: "set" }])}>
          + Add rule
        </Button>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {extra.length > 0 ? (data.match === "any" ? "Yes when any rule matches. " : "Yes when every rule matches. ") : ""}
        Connect the Yes and No handles to the next steps.
      </p>
    </div>
  );
}
