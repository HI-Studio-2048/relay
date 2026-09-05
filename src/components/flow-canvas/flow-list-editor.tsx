"use client";

import { MediaPicker } from "@/components/flow-canvas/media-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FlowEditorRecord, FlowStep, TriggerType } from "@/lib/types";

function emptyStep(type: FlowStep["type"]): FlowStep {
  const id = crypto.randomUUID().slice(0, 8);
  if (type === "capture") return { id, type, field: "name", prompt: "Your answer?", next: "" };
  if (type === "form") {
    return {
      id,
      type,
      intro: "A few quick details:",
      fields: [
        { field: "name", prompt: "What's your name?" },
        { field: "email", prompt: "What's the best email?" },
      ],
      next: "",
    };
  }
  if (type === "tag") return { id, type, tagName: "lead", action: "add", next: "" };
  if (type === "subscribe") return { id, type, listName: "newsletter", action: "subscribe", next: "" };
  if (type === "delay") return { id, type, seconds: 300, next: "" };
  if (type === "condition") {
    return { id, type, check: "tag", tagName: "lead", nextTrue: "", nextFalse: "" };
  }
  if (type === "end") return { id, type, text: "Done." };
  return { id, type: "text", text: "Hello.", buttons: [], next: "" };
}

function formatButtons(step: Extract<FlowStep, { type: "text" }>) {
  return (step.buttons ?? [])
    .map((button) => (button.url ? `${button.text} | ${button.url}` : `${button.text} > ${button.next ?? ""}`))
    .join(", ");
}

function parseButtons(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const urlSplit = part.split("|").map((item) => item.trim());
      if (urlSplit.length > 1 && /^https?:\/\//i.test(urlSplit[1] ?? "")) {
        return { text: urlSplit[0] || "Open", url: urlSplit[1] };
      }
      const [text, next] = part.split(">").map((item) => item.trim());
      return { text: text || "Continue", next: next || "" };
    });
}

function triggerMatchPlaceholder(type: TriggerType) {
  if (type === "command") return "/help";
  if (type === "start_param") return "promo";
  return "pricing";
}

export function FlowListEditor({
  flow,
  onChange,
}: {
  flow: FlowEditorRecord;
  onChange: (flow: FlowEditorRecord) => void;
}) {
  const definition = flow.definition;
  const param = (flow.triggerValue ?? "").trim() || "promo";

  const updateStep = (index: number, step: FlowStep) => {
    const steps = definition.steps.slice();
    steps[index] = step;
    onChange({ ...flow, definition: { ...definition, steps } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Trigger</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={flow.name} onChange={(event) => onChange({ ...flow, name: event.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>When</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={flow.triggerType}
              onChange={(event) => onChange({ ...flow, triggerType: event.target.value as TriggerType })}
            >
              <option value="start">/start</option>
              <option value="start_param">Growth link</option>
              <option value="command">Command</option>
              <option value="keyword">Exact keyword</option>
            </select>
          </div>
          {flow.triggerType !== "start" ? (
            <div className="space-y-1">
              <Label>{flow.triggerType === "start_param" ? "Start payload" : "Match"}</Label>
              <Input
                value={flow.triggerValue ?? ""}
                onChange={(event) => onChange({ ...flow, triggerValue: event.target.value })}
                placeholder={triggerMatchPlaceholder(flow.triggerType)}
              />
            </div>
          ) : null}
          {flow.triggerType === "start_param" ? (
            <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">
              Share t.me/&lt;bot&gt;?start={param}. Telegram sends /start {param}.
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={flow.isActive}
              onChange={(event) => onChange({ ...flow, isActive: event.target.checked })}
            />
            Active
          </label>
          <div className="space-y-1">
            <Label>Start step id</Label>
            <Input
              value={definition.startStepId}
              onChange={(event) =>
                onChange({ ...flow, definition: { ...definition, startStepId: event.target.value } })
              }
            />
          </div>
        </CardContent>
      </Card>

      {definition.steps.map((step, index) => (
        <Card key={step.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span>
                {index + 1}. {step.type} · {step.id}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...flow,
                    definition: {
                      ...definition,
                      steps: definition.steps.filter((_, i) => i !== index),
                    },
                  })
                }
              >
                Remove
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {step.type === "text" ? (
              <>
                <MediaPicker
                  value={step.media}
                  onChange={(media) => updateStep(index, { ...step, media })}
                />
                <Textarea
                  value={step.text}
                  onChange={(event) => updateStep(index, { ...step, text: event.target.value })}
                />
                <Input
                  placeholder="Next step id (if no callback buttons)"
                  value={step.next ?? ""}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
                <Input
                  placeholder='Buttons: "Label > nextId, Site | https://…"'
                  value={formatButtons(step)}
                  onChange={(event) =>
                    updateStep(index, {
                      ...step,
                      buttons: parseButtons(event.target.value),
                    })
                  }
                />
              </>
            ) : null}
            {step.type === "capture" ? (
              <>
                <select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={step.field}
                  onChange={(event) =>
                    updateStep(index, { ...step, field: event.target.value as typeof step.field })
                  }
                >
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="custom:company">Custom: company</option>
                </select>
                <Textarea
                  value={step.prompt}
                  onChange={(event) => updateStep(index, { ...step, prompt: event.target.value })}
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "form" ? (
              <>
                <Textarea
                  placeholder="Optional intro"
                  value={step.intro ?? ""}
                  onChange={(event) => updateStep(index, { ...step, intro: event.target.value })}
                />
                <Input
                  placeholder='Fields: "name: What is your name?, email: Best email?"'
                  value={step.fields.map((field) => `${field.field}: ${field.prompt}`).join(", ")}
                  onChange={(event) =>
                    updateStep(index, {
                      ...step,
                      fields: event.target.value
                        .split(",")
                        .map((part) => part.trim())
                        .filter(Boolean)
                        .map((part) => {
                          const [rawField, ...rest] = part.split(":");
                          const field = (rawField?.trim() || "name") as typeof step.fields[number]["field"];
                          return { field, prompt: rest.join(":").trim() || "Your answer?" };
                        }),
                    })
                  }
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "tag" ? (
              <>
                <select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={step.action === "remove" ? "remove" : "add"}
                  onChange={(event) =>
                    updateStep(index, { ...step, action: event.target.value === "remove" ? "remove" : "add" })
                  }
                >
                  <option value="add">Add tag</option>
                  <option value="remove">Remove tag</option>
                </select>
                <Input
                  value={step.tagName}
                  onChange={(event) => updateStep(index, { ...step, tagName: event.target.value })}
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "subscribe" ? (
              <>
                <select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={step.action}
                  onChange={(event) =>
                    updateStep(index, {
                      ...step,
                      action: event.target.value === "unsubscribe" ? "unsubscribe" : "subscribe",
                    })
                  }
                >
                  <option value="subscribe">Subscribe</option>
                  <option value="unsubscribe">Unsubscribe</option>
                </select>
                <Input
                  placeholder="List name (or all)"
                  value={step.listName}
                  onChange={(event) => updateStep(index, { ...step, listName: event.target.value })}
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "delay" ? (
              <>
                <Input
                  type="number"
                  min={0}
                  value={step.seconds}
                  onChange={(event) =>
                    updateStep(index, {
                      ...step,
                      seconds: Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                    })
                  }
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "condition" ? (
              <>
                <select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={step.check}
                  onChange={(event) =>
                    updateStep(index, {
                      ...step,
                      check:
                        event.target.value === "field"
                          ? "field"
                          : event.target.value === "subscription"
                            ? "subscription"
                            : "tag",
                    })
                  }
                >
                  <option value="tag">Has tag</option>
                  <option value="subscription">Subscribed to list</option>
                  <option value="field">Field value</option>
                </select>
                {step.check === "tag" || step.check === "subscription" ? (
                  <Input
                    placeholder="Tag name"
                    value={step.tagName ?? ""}
                    onChange={(event) => updateStep(index, { ...step, tagName: event.target.value })}
                  />
                ) : (
                  <>
                    <Input
                      placeholder="Field (name, email, phone, custom:company)"
                      value={step.field ?? "email"}
                      onChange={(event) =>
                        updateStep(index, { ...step, field: event.target.value as typeof step.field })
                      }
                    />
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={step.op ?? "set"}
                      onChange={(event) =>
                        updateStep(index, {
                          ...step,
                          op: event.target.value as NonNullable<typeof step.op>,
                        })
                      }
                    >
                      <option value="set">Is set</option>
                      <option value="eq">Equals</option>
                      <option value="contains">Contains</option>
                    </select>
                    {(step.op ?? "set") !== "set" ? (
                      <Input
                        placeholder="Value"
                        value={step.value ?? ""}
                        onChange={(event) => updateStep(index, { ...step, value: event.target.value })}
                      />
                    ) : null}
                  </>
                )}
                <Input
                  placeholder="Yes → step id"
                  value={step.nextTrue}
                  onChange={(event) => updateStep(index, { ...step, nextTrue: event.target.value })}
                />
                <Input
                  placeholder="No → step id"
                  value={step.nextFalse}
                  onChange={(event) => updateStep(index, { ...step, nextFalse: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "end" ? (
              <Textarea
                value={step.text ?? ""}
                onChange={(event) => updateStep(index, { ...step, text: event.target.value })}
              />
            ) : null}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        {(["text", "capture", "form", "tag", "subscribe", "condition", "delay", "end"] as const).map((type) => (
          <Button
            key={type}
            variant="outline"
            onClick={() =>
              onChange({
                ...flow,
                definition: { ...definition, steps: [...definition.steps, emptyStep(type)] },
              })
            }
          >
            Add {type}
          </Button>
        ))}
      </div>
    </div>
  );
}
