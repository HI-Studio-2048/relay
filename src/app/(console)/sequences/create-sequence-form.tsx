"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client";

type StepDraft = { delaySeconds: number; body: string };

export function CreateSequenceForm({ botId }: { botId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([
    { delaySeconds: 0, body: "Welcome — thanks for opting in." },
    { delaySeconds: 86400, body: "Day 2: {{name}}, here is the next step." },
  ]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/api/sequences", {
        method: "POST",
        body: JSON.stringify({ botId, name, steps }),
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
        <div key={index} className="grid gap-2 sm:grid-cols-[140px_1fr]">
          <div className="space-y-1">
            <Label>Delay (seconds)</Label>
            <Input
              type="number"
              min={0}
              value={step.delaySeconds}
              onChange={(event) => {
                const next = steps.slice();
                next[index] = { ...step, delaySeconds: Number.parseInt(event.target.value, 10) || 0 };
                setSteps(next);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>Message {index + 1}</Label>
            <Textarea
              rows={2}
              value={step.body}
              onChange={(event) => {
                const next = steps.slice();
                next[index] = { ...step, body: event.target.value };
                setSteps(next);
              }}
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setSteps([...steps, { delaySeconds: 86400, body: "" }])}
        >
          Add message
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Create sequence"}
        </Button>
      </div>
    </div>
  );
}
