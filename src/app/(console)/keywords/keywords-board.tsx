"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CanvasCard } from "@/components/chrome/tone";
import { api } from "@/lib/client";
import { matchFlowTrigger, type FlowRecord } from "@/lib/flow-engine";
import { KEYWORD_RULE_OPTIONS, shadowedKeywords, type KeywordTriggerType } from "@/lib/keywords";

type KeywordFlow = {
  id: string;
  name: string;
  triggerType: KeywordTriggerType;
  triggerValue: string | null;
  isActive: boolean;
  priority: number;
};

const RULE_LABEL = Object.fromEntries(KEYWORD_RULE_OPTIONS.map((item) => [item.value, item.label]));

type OtherFlow = { id: string; name: string; triggerType: string; triggerValue: string | null; isActive: boolean; priority: number };

const EMPTY_DEFINITION = { startStepId: "", steps: [] };

export function KeywordsBoard({ botId, initial, others = [] }: { botId: string; initial: KeywordFlow[]; others?: OtherFlow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [probe, setProbe] = useState("");
  const shadowed = useMemo(() => shadowedKeywords(rows), [rows]);
  const probeResult = useMemo(() => {
    if (!probe.trim()) return null;
    // Same ranking the engine uses: commands and /start first, then keywords in list order, then default.
    const records: (FlowRecord & { name: string })[] = [
      ...rows.map((flow, index) => ({ ...flow, priority: index, definition: EMPTY_DEFINITION })),
      ...others.map((flow) => ({ ...flow, triggerType: flow.triggerType as FlowRecord["triggerType"], definition: EMPTY_DEFINITION })),
    ];
    const matched = matchFlowTrigger(records, probe) as (FlowRecord & { name: string }) | null;
    const intents = others.filter((flow) => flow.triggerType === "intent");
    return { matched, intentsMayCatch: (!matched || matched.triggerType === "default") && intents.length > 0 };
  }, [probe, rows, others]);
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [rule, setRule] = useState<KeywordTriggerType>("keyword_contains");
  const [busy, setBusy] = useState(false);

  const persistOrder = async (next: KeywordFlow[]) => {
    setRows(next);
    try {
      await Promise.all(
        next.map((flow, index) =>
          api(`/api/flows/${flow.id}`, {
            method: "PATCH",
            body: JSON.stringify({ priority: index }),
          }),
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder keywords");
    }
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    void persistOrder(next);
  };

  const create = async () => {
    if (!name.trim() || !words.trim()) return;
    setBusy(true);
    try {
      const data = await api<{ flow: { id: string } }>("/api/flows", {
        method: "POST",
        body: JSON.stringify({
          botId,
          name: name.trim(),
          triggerType: rule,
          triggerValue: words.trim(),
          priority: rows.length,
        }),
      });
      toast.success("Keyword created");
      router.push(`/flows/${data.flow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create keyword");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (flow: KeywordFlow) => {
    try {
      await api(`/api/flows/${flow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !flow.isActive }),
      });
      setRows((current) =>
        current.map((row) => (row.id === flow.id ? { ...row, isActive: !row.isActive } : row)),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update keyword");
    }
  };

  return (
    <div className="space-y-4">
      <CanvasCard className="space-y-3 p-4">
        <p className="text-sm font-medium">New keyword</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Pricing" />
          </div>
          <div className="space-y-1">
            <Label>Rule</Label>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={rule}
              onChange={(event) => setRule(event.target.value as KeywordTriggerType)}
            >
              {KEYWORD_RULE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Keywords (comma-separated, max 10)</Label>
            <Input
              value={words}
              onChange={(event) => setWords(event.target.value)}
              placeholder="price, cost, how much"
            />
            <p className="text-[11px] text-muted-foreground">
              {KEYWORD_RULE_OPTIONS.find((item) => item.value === rule)?.hint}. List order is priority —
              the first matching keyword wins.
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => void create()} disabled={busy || !name.trim() || !words.trim()}>
          {busy ? "Creating…" : "Create keyword"}
        </Button>
      </CanvasCard>

      {rows.length > 0 ? (
        <CanvasCard className="space-y-2 p-4">
          <Label htmlFor="keyword-probe">Test a message</Label>
          <Input id="keyword-probe" value={probe} onChange={(event) => setProbe(event.target.value)} placeholder="Type what someone might send, e.g. how much is it?" />
          {probeResult ? (
            <p className="text-[13px]">
              {probeResult.matched ? (
                <>
                  Goes to <span className="font-medium">{probeResult.matched.name}</span>
                  {probeResult.matched.triggerType === "default" ? " (default reply)" : ""}
                </>
              ) : (
                <span className="text-muted-foreground">No keyword matches.</span>
              )}
              {probeResult.intentsMayCatch ? (
                <span className="text-muted-foreground"> · an AI intent flow may claim it first</span>
              ) : null}
            </p>
          ) : null}
        </CanvasCard>
      ) : null}

      {rows.length === 0 ? null : (
        <div className="space-y-2">
          {rows.map((flow, index) => (
            <CanvasCard key={flow.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{flow.name}</p>
                <p className="text-xs text-muted-foreground">
                  {RULE_LABEL[flow.triggerType] ?? flow.triggerType} · {flow.triggerValue || "—"}
                </p>
                {shadowed
                  .filter((item) => item.flowId === flow.id)
                  .map((item) => (
                    <p key={item.keyword} className="mt-1 text-xs text-amber-700">
                      ⚠ Typing “{item.keyword}” goes to {item.byName} (higher in the list). Move this one up or change the keyword.
                    </p>
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => move(index, -1)} disabled={index === 0}>
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                >
                  Down
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void toggle(flow)}>
                  {flow.isActive ? "On" : "Off"}
                </Button>
                <Button type="button" size="sm" onClick={() => router.push(`/flows/${flow.id}`)}>
                  Edit flow
                </Button>
              </div>
            </CanvasCard>
          ))}
        </div>
      )}
    </div>
  );
}
