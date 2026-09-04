"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client";
import type { FlowDefinition, FlowStep, TriggerType } from "@/lib/types";

export type FlowRecord = {
  id: string;
  name: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  isActive: boolean;
  definition: FlowDefinition;
};

function emptyStep(type: FlowStep["type"]): FlowStep {
  const id = crypto.randomUUID().slice(0, 8);
  if (type === "capture") return { id, type, field: "name", prompt: "Your answer?", next: "" };
  if (type === "tag") return { id, type, tagName: "lead", next: "" };
  if (type === "end") return { id, type, text: "Done." };
  return { id, type: "text", text: "Hello.", buttons: [], next: "" };
}

export function FlowEditor({ initialFlow }: { initialFlow: FlowRecord }) {
  const [flow, setFlow] = useState(initialFlow);
  const definition = flow.definition;

  const updateStep = (index: number, step: FlowStep) => {
    const steps = definition.steps.slice();
    steps[index] = step;
    setFlow({ ...flow, definition: { ...definition, steps } });
  };

  const save = async () => {
    try {
      const data = await api<{ flow: FlowRecord }>(`/api/flows/${flow.id}`, {
        method: "PATCH",
        body: JSON.stringify(flow),
      });
      setFlow(data.flow);
      toast.success("Flow saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this flow?")) return;
    try {
      await api(`/api/flows/${flow.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      window.location.href = "/flows";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-heading text-3xl tracking-tight">Edit flow</h1>
        <div className="flex gap-2">
          <Button onClick={() => void save()}>Save</Button>
          <Button variant="destructive" onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trigger</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={flow.name} onChange={(e) => setFlow({ ...flow, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>When</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={flow.triggerType}
              onChange={(e) => setFlow({ ...flow, triggerType: e.target.value as TriggerType })}
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
                onChange={(e) => setFlow({ ...flow, triggerValue: e.target.value })}
                placeholder={flow.triggerType === "command" ? "/help" : "pricing"}
              />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={flow.isActive}
              onChange={(e) => setFlow({ ...flow, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="space-y-1">
            <Label>Start step id</Label>
            <Input
              value={definition.startStepId}
              onChange={(e) =>
                setFlow({ ...flow, definition: { ...definition, startStepId: e.target.value } })
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
                  setFlow({
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
                <Textarea
                  value={step.text}
                  onChange={(e) => updateStep(index, { ...step, text: e.target.value })}
                />
                <Input
                  placeholder="Next step id (if no buttons)"
                  value={step.next ?? ""}
                  onChange={(e) => updateStep(index, { ...step, next: e.target.value })}
                />
                <Input
                  placeholder='Buttons as "Label > nextId, Label > nextId"'
                  value={(step.buttons ?? []).map((b) => `${b.text} > ${b.next}`).join(", ")}
                  onChange={(e) =>
                    updateStep(index, {
                      ...step,
                      buttons: e.target.value
                        .split(",")
                        .map((part) => part.trim())
                        .filter(Boolean)
                        .map((part) => {
                          const [text, next] = part.split(">").map((s) => s.trim());
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
                  onChange={(e) =>
                    updateStep(index, { ...step, field: e.target.value as typeof step.field })
                  }
                >
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="custom:company">Custom: company</option>
                </select>
                <Textarea
                  value={step.prompt}
                  onChange={(e) => updateStep(index, { ...step, prompt: e.target.value })}
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(e) => updateStep(index, { ...step, next: e.target.value })}
                />
              </>
            ) : null}
            {step.type === "tag" ? (
              <>
                <Input
                  value={step.tagName}
                  onChange={(e) => updateStep(index, { ...step, tagName: e.target.value })}
                />
                <Input
                  placeholder="Next step id"
                  value={step.next}
                  onChange={(e) => updateStep(index, { ...step, next: e.target.value })}
                />
              </>
            ) : null}
            {step.type === "end" ? (
              <Textarea
                value={step.text ?? ""}
                onChange={(e) => updateStep(index, { ...step, text: e.target.value })}
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
              setFlow({
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
