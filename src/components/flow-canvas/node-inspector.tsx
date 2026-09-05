"use client";

import { MediaPicker } from "@/components/flow-canvas/media-picker";
import { NODE_TONE } from "@/components/flow-canvas/node-colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nextButtonHandleId, TRIGGER_NODE_ID, type CanvasButton, type CanvasNodeData } from "@/lib/flow-canvas";
import type { CaptureField, ConditionOp, FormField, TagAction, TriggerType } from "@/lib/types";

export type InspectorField = { key: string; label: string };

export type FlowMeta = {
  name: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  isActive: boolean;
};

function parseCaptureSelect(value: string, customKey: string): CaptureField {
  if (value === "name" || value === "email" || value === "phone") return value;
  const key = customKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") || "company";
  return `custom:${key}`;
}

function triggerMatchPlaceholder(type: TriggerType) {
  if (type === "command") return "/help";
  if (type === "start_param") return "promo";
  return "pricing";
}

export function NodeInspector({
  selectedId,
  data,
  meta,
  customFields,
  tagNames,
  onMetaChange,
  onDataChange,
  onDelete,
}: {
  selectedId: string | null;
  data: CanvasNodeData | null;
  meta: FlowMeta;
  customFields: InspectorField[];
  tagNames: string[];
  onMetaChange: (patch: Partial<FlowMeta>) => void;
  onDataChange: (id: string, data: CanvasNodeData) => void;
  onDelete: (id: string) => void;
}) {
  if (!selectedId || !data) {
    return (
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l bg-sidebar/60 p-4 md:block">
        <p className="text-sm font-medium">Properties</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a node to edit it. The trigger sets when Telegram starts this flow.
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
            {data.kind}
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
              <option value="start">/start</option>
              <option value="start_param">Growth link</option>
              <option value="command">Command</option>
              <option value="keyword">Exact keyword</option>
            </select>
          </div>
          {meta.triggerType !== "start" ? (
            <div className="space-y-1">
              <Label>{meta.triggerType === "start_param" ? "Start payload" : "Match"}</Label>
              <Input
                value={meta.triggerValue ?? ""}
                onChange={(event) => onMetaChange({ triggerValue: event.target.value })}
                placeholder={triggerMatchPlaceholder(meta.triggerType)}
              />
            </div>
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

      {data.kind === "delay" ? (
        <DelayEditor data={data} onChange={(next) => onDataChange(selectedId, next)} />
      ) : null}

      {data.kind === "condition" ? (
        <ConditionEditor
          data={data}
          customFields={customFields}
          tagNames={tagNames}
          onChange={(next) => onDataChange(selectedId, next)}
        />
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
        onChange={(field) => onChange({ ...data, field })}
      />
      <div className="space-y-1">
        <Label>Prompt</Label>
        <Textarea
          rows={4}
          value={data.prompt}
          onChange={(event) => onChange({ ...data, prompt: event.target.value })}
        />
      </div>
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
  const presets = [
    { label: "Now", seconds: 0 },
    { label: "30s", seconds: 30 },
    { label: "5m", seconds: 300 },
    { label: "1h", seconds: 3600 },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Wait (seconds)</Label>
        <Input
          type="number"
          min={0}
          value={data.seconds}
          onChange={(event) =>
            onChange({ ...data, seconds: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })
          }
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="xs"
            variant={data.seconds === preset.seconds ? "default" : "outline"}
            onClick={() => onChange({ ...data, seconds: preset.seconds })}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Zero continues immediately. Longer waits resume on the next worker tick after the time is up.
      </p>
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
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Check</Label>
        <select
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={data.check}
          onChange={(event) =>
            onChange({ ...data, check: event.target.value === "field" ? "field" : "tag" })
          }
        >
          <option value="tag">Has tag</option>
          <option value="field">Field value</option>
        </select>
      </div>
      {data.check === "tag" ? (
        <div className="space-y-1">
          <Label>Tag name</Label>
          <Input
            list="relay-condition-tags"
            value={data.tagName}
            onChange={(event) => onChange({ ...data, tagName: event.target.value })}
          />
          <datalist id="relay-condition-tags">
            {tagNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      ) : (
        <>
          <FieldSelect
            field={data.field}
            customFields={customFields}
            onChange={(field) => onChange({ ...data, field })}
          />
          <div className="space-y-1">
            <Label>Operator</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={data.op}
              onChange={(event) => onChange({ ...data, op: event.target.value as ConditionOp })}
            >
              <option value="set">Is set</option>
              <option value="eq">Equals</option>
              <option value="contains">Contains</option>
            </select>
          </div>
          {data.op !== "set" ? (
            <div className="space-y-1">
              <Label>Value</Label>
              <Input
                value={data.value}
                onChange={(event) => onChange({ ...data, value: event.target.value })}
              />
            </div>
          ) : null}
        </>
      )}
      <p className="text-[11px] text-muted-foreground">Connect the Yes and No handles to the next steps.</p>
    </div>
  );
}
