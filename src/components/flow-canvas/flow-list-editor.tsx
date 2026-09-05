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
  if (type === "tag") return { id, type, tagName: "lead", next: "" };
  if (type === "end") return { id, type, text: "Done." };
  return { id, type: "text", text: "Hello.", buttons: [], next: "" };
}

export function FlowListEditor({
  flow,
  onChange,
}: {
  flow: FlowEditorRecord;
  onChange: (flow: FlowEditorRecord) => void;
}) {
  const definition = flow.definition;

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
              <option value="command">Command</option>
              <option value="keyword">Exact keyword</option>
            </select>
          </div>
          {flow.triggerType !== "start" ? (
            <div className="space-y-1">
              <Label>Match</Label>
              <Input
                value={flow.triggerValue ?? ""}
                onChange={(event) => onChange({ ...flow, triggerValue: event.target.value })}
                placeholder={flow.triggerType === "command" ? "/help" : "pricing"}
              />
            </div>
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
                  placeholder="Next step id (if no buttons)"
                  value={step.next ?? ""}
                  onChange={(event) => updateStep(index, { ...step, next: event.target.value })}
                />
                <Input
                  placeholder='Buttons as "Label > nextId, Label > nextId"'
                  value={(step.buttons ?? []).map((button) => `${button.text} > ${button.next}`).join(", ")}
                  onChange={(event) =>
                    updateStep(index, {
                      ...step,
                      buttons: event.target.value
                        .split(",")
                        .map((part) => part.trim())
                        .filter(Boolean)
                        .map((part) => {
                          const [text, next] = part.split(">").map((item) => item.trim());
                          return { text: text || "Continue", next: next || "" };
                        }),
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
            {step.type === "tag" ? (
              <>
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
        {(["text", "capture", "tag", "end"] as const).map((type) => (
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
