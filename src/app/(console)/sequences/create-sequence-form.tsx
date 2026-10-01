"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client";

type Unit = "minutes" | "hours" | "days";
type StepDraft = { amount: number; unit: Unit; kind: "message" | "flow"; body: string; flowId: string };

const SECONDS: Record<Unit, number> = { minutes: 60, hours: 3600, days: 86400 };

export function CreateSequenceForm({ botId, flows = [] }: { botId: string; flows?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([
    { amount: 0, unit: "minutes", kind: "message", body: "Welcome — thanks for opting in, {{first_name|there}}!", flowId: "" },
    { amount: 1, unit: "days", kind: "message", body: "Day 2: here is the next step.", flowId: "" },
  ]);
  const [busy, setBusy] = useState(false);

  const update = (index: number, patch: Partial<StepDraft>) => setSteps(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/api/sequences", {
        method: "POST",
        body: JSON.stringify({
          botId,
          name,
          steps: steps.map((step) => ({
            delaySeconds: Math.max(0, step.amount) * SECONDS[step.unit],
            body: step.kind === "message" ? step.body : "",
            flowId: step.kind === "flow" ? step.flowId || flows[0]?.id || null : null,
          })),
        }),
      });
      toast.success("Sequence created");
      setName("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create sequence");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Name (also the subscribe list)</Label>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="welcome_drip" />
      </div>
      {steps.map((step, index) => (
        <div key={index} className="space-y-2 rounded-xl p-3 ring-1 ring-[#e5e7eb]">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium text-[#1b1f24]">{index + 1}.</span>
            <span className="text-[#6b7280]">{index === 0 ? "Wait" : "Then wait"}</span>
            <Input
              type="number"
              min={0}
              aria-label="Delay"
              className="w-20"
              value={step.amount}
              onChange={(event) => update(index, { amount: Number.parseInt(event.target.value, 10) || 0 })}
            />
            <select
              aria-label="Delay unit"
              className="rounded-lg border border-input bg-background px-2 py-1.5"
              value={step.unit}
              onChange={(event) => update(index, { unit: event.target.value as Unit })}
            >
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
            <span className="text-[#6b7280]">then send</span>
            <select
              aria-label="Step type"
              className="rounded-lg border border-input bg-background px-2 py-1.5"
              value={step.kind}
              onChange={(event) => update(index, { kind: event.target.value as StepDraft["kind"] })}
            >
              <option value="message">a message</option>
              <option value="flow" disabled={flows.length === 0}>
                a flow
              </option>
            </select>
            {steps.length > 1 ? (
              <button type="button" aria-label="Remove step" className="ml-auto p-1 text-[#8b95a1] hover:text-[#1b1f24]" onClick={() => setSteps(steps.filter((_, i) => i !== index))}>
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          {step.kind === "message" ? (
            <Textarea rows={2} value={step.body} onChange={(event) => update(index, { body: event.target.value })} />
          ) : (
            <select
              aria-label="Flow"
              className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[13px]"
              value={step.flowId || flows[0]?.id}
              onChange={(event) => update(index, { flowId: event.target.value })}
            >
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setSteps([...steps, { amount: 1, unit: "days", kind: "message", body: "", flowId: "" }])}>
          Add step
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Create sequence"}
        </Button>
      </div>
    </div>
  );
}
