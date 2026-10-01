"use client";

import { MediaPicker } from "@/components/flow-canvas/media-picker";
import { SplitTrafficEditor } from "@/components/flow-canvas/split-traffic-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FlowEditorRecord, FlowStep, HttpMethod, TriggerType } from "@/lib/types";
import { TRIGGER_OPTIONS } from "@/lib/types";
import { SocialTriggerEditor, type InspectorFlowOption } from "@/components/flow-canvas/node-inspector";
import { isSocialTrigger } from "@/lib/social-triggers";
import { parseCollectList } from "@/lib/flow-canvas";

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
  if (type === "set_field") return { id, type, field: "custom:source", value: "flow", next: "" };
  if (type === "subscribe") return { id, type, listName: "newsletter", action: "subscribe", next: "" };
  if (type === "delay") return { id, type, seconds: 300, next: "" };
  if (type === "randomizer") {
    return {
      id,
      type,
      sticky: true,
      paths: [
        { id: "path-a", percent: 50, next: "" },
        { id: "path-b", percent: 50, next: "" },
      ],
    };
  }
  if (type === "condition") {
    return { id, type, check: "tag", tagName: "lead", nextTrue: "", nextFalse: "" };
  }
  if (type === "start_flow") return { id, type, flowId: "", next: "" };
  if (type === "http") return { id, type, url: "https://", method: "POST", body: "", next: "" };
  if (type === "notify") return { id, type, text: "New lead: {{name}} {{email}}", next: "" };
  if (type === "ai") return { id, type, goal: "Answer their questions and find out what they need", collect: ["email"] };
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

function formatQuickReplies(step: Extract<FlowStep, { type: "text" }>) {
  return (step.quickReplies ?? []).map((reply) => `${reply.text} > ${reply.next ?? ""}`).join(", ");
}

function parseQuickReplies(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [text, next] = part.split(">").map((item) => item.trim());
      return { text: text || "Reply", next: next || "" };
    });
}

function triggerMatchPlaceholder(type: TriggerType) {
  if (type === "command") return "/help";
  if (type === "start_param") return "promo";
  if (type === "keyword_contains") return "price";
  return "pricing";
}

function triggerNeedsValue(type: TriggerType) {
  return type !== "start" && type !== "default" && type !== "story_mention";
}

export function FlowListEditor({
  flow,
  otherFlows = [],
  onChange,
}: {
  flow: FlowEditorRecord;
  otherFlows?: InspectorFlowOption[];
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
              {TRIGGER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {triggerNeedsValue(flow.triggerType) ? (
            <div className="space-y-1">
              <Label>{flow.triggerType === "start_param" ? "Start payload" : "Match"}</Label>
              <Input
                value={flow.triggerValue ?? ""}
                onChange={(event) => onChange({ ...flow, triggerValue: event.target.value })}
                placeholder={triggerMatchPlaceholder(flow.triggerType)}
              />
            </div>
          ) : null}
          {isSocialTrigger(flow.triggerType) ? (
            <div className="sm:col-span-2">
              <SocialTriggerEditor
                type={flow.triggerType}
                config={definition.trigger}
                onChange={(trigger) => onChange({ ...flow, definition: { ...definition, trigger } })}
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
                <Input
                  placeholder='Quick replies: "Yes > nextId, No > otherId"'
                  value={formatQuickReplies(step)}
                  onChange={(event) => {
                    const quickReplies = parseQuickReplies(event.target.value);
                    const next = { ...step };
                    if (quickReplies.length > 0) next.quickReplies = quickReplies;
                    else delete next.quickReplies;
                    updateStep(index, next);
                  }}
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
            {step.type === "set_field" ? (
              <>
                <Input
                  placeholder="Field (name, email, phone, custom:company)"
                  value={step.field}
                  onChange={(event) =>
                    updateStep(index, { ...step, field: event.target.value as typeof step.field })
                  }
                />
                <Input
                  placeholder="Value (empty clears)"
                  value={step.value}
                  onChange={(event) => updateStep(index, { ...step, value: event.target.value })}
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
            {step.type === "randomizer" ? (
              <div className="space-y-2 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!step.sticky}
                    onChange={(event) => updateStep(index, { ...step, sticky: !event.target.checked })}
                  />
                  Random path every time
                </label>
                <SplitTrafficEditor
                  paths={step.paths}
                  showNext
                  onChange={(paths) => updateStep(index, { ...step, paths })}
                />
              </div>
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
            {step.type === "start_flow" ? (
              <>
                <select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={step.flowId}
                  onChange={(event) => updateStep(index, { ...step, flowId: event.target.value })}
                >
                  <option value="">Choose a flow</option>
                  {otherFlows.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Fallback next step id"
                  value={step.next ?? ""}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "http" ? (
              <>
                <select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={step.method === "GET" ? "GET" : "POST"}
                  onChange={(event) =>
                    updateStep(index, { ...step, method: event.target.value as HttpMethod })
                  }
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
                <Input
                  placeholder="https://..."
                  value={step.url}
                  onChange={(event) => updateStep(index, { ...step, url: event.target.value })}
                />
                <Textarea
                  placeholder='{"email":"{{email}}"}'
                  value={step.body ?? ""}
                  onChange={(event) => updateStep(index, { ...step, body: event.target.value })}
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "notify" ? (
              <>
                <Textarea
                  value={step.text}
                  onChange={(event) => updateStep(index, { ...step, text: event.target.value })}
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
              </>
            ) : null}
            {step.type === "ai" ? (
              <>
                <Textarea
                  placeholder="Goal"
                  value={step.goal}
                  onChange={(event) => updateStep(index, { ...step, goal: event.target.value })}
                />
                <Input
                  placeholder="Collect (email, phone, budget)"
                  value={(step.collect ?? []).join(", ")}
                  onChange={(event) => updateStep(index, { ...step, collect: parseCollectList(event.target.value) })}
                />
                <Input
                  placeholder="Next step id when the goal is reached"
                  value={step.next ?? ""}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value || undefined })}
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
        {(
          [
            "text",
            "capture",
            "form",
            "tag",
            "set_field",
            "subscribe",
            "condition",
            "delay",
            "randomizer",
            "start_flow",
            "http",
            "notify",
            "ai",
            "end",
          ] as const
        ).map((type) => (
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
