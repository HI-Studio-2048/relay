"use client";

import { MediaPicker } from "@/components/flow-canvas/media-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nextButtonHandleId, TRIGGER_NODE_ID, type CanvasButton, type CanvasNodeData } from "@/lib/flow-canvas";
import type { CaptureField, TriggerType } from "@/lib/types";

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

  return (
    <aside className="max-h-[42vh] w-full shrink-0 overflow-y-auto border-t bg-sidebar/80 p-4 md:max-h-none md:w-80 md:border-t-0 md:border-l">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium capitalize">{data.kind}</p>
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
              <option value="command">Command</option>
              <option value="keyword">Exact keyword</option>
            </select>
          </div>
          {meta.triggerType !== "start" ? (
            <div className="space-y-1">
              <Label>Match</Label>
              <Input
                value={meta.triggerValue ?? ""}
                onChange={(event) => onMetaChange({ triggerValue: event.target.value })}
                placeholder={meta.triggerType === "command" ? "/help" : "pricing"}
              />
            </div>
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
        <ButtonsEditor
          data={data}
          onChange={(next) => onDataChange(selectedId, next)}
        />
      ) : null}

      {data.kind === "capture" ? (
        <CaptureEditor
          data={data}
          customFields={customFields}
          onChange={(next) => onDataChange(selectedId, next)}
        />
      ) : null}

      {data.kind === "tag" ? (
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
  const updateButton = (index: number, text: string) => {
    const buttons = data.buttons.map((button, i) => (i === index ? { ...button, text } : button));
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
          <div key={button.id} className="flex gap-2">
            <Input value={button.text} onChange={(event) => updateButton(index, event.target.value)} />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeButton(index)}>
              ×
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={addButton}>
          Add button
        </Button>
      </div>
    </div>
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
  const isCustom = data.field.startsWith("custom:");
  const customKey = isCustom ? data.field.slice("custom:".length) : customFields[0]?.key ?? "company";
  const selectValue = isCustom ? "custom" : data.field;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Write to</Label>
        <select
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={selectValue}
          onChange={(event) =>
            onChange({ ...data, field: parseCaptureSelect(event.target.value, customKey) })
          }
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
              value={customFields.some((field) => field.key === customKey) ? customKey : ""}
              onChange={(event) =>
                onChange({ ...data, field: parseCaptureSelect("custom", event.target.value) })
              }
            >
              <option value="" disabled>
                Choose a field
              </option>
              {customFields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          ) : null}
          <Input
            value={customKey}
            onChange={(event) =>
              onChange({ ...data, field: parseCaptureSelect("custom", event.target.value) })
            }
            placeholder="company"
          />
        </div>
      ) : null}
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
