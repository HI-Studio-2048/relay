"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FlowListEditor } from "@/components/flow-canvas/flow-list-editor";
import { FlowShareButton } from "@/components/flow-canvas/flow-share-dialog";
import { FlowSimulator } from "@/components/flow-canvas/flow-simulator";
import { FlowStatsContext, type NodeStats } from "@/components/flow-canvas/flow-stats-context";
import type { FlowCanvasHandle } from "@/components/flow-canvas/flow-canvas-editor";
import type { FlowMeta, InspectorField, InspectorFlowOption } from "@/components/flow-canvas/node-inspector";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { CHANNELS, type ChannelId } from "@/lib/channels/types";
import type { CanvasValidation } from "@/lib/flow-canvas";
import type { FlowEditorRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const FlowCanvasEditor = dynamic(() => import("@/components/flow-canvas/flow-canvas-editor"), {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading canvas…
      </div>
    ),
  },
);

export function FlowWorkspace({
  initialFlow,
  customFields,
  tagNames,
  otherFlows,
  channel = "telegram",
}: {
  initialFlow: FlowEditorRecord;
  customFields: InspectorField[];
  tagNames: string[];
  otherFlows: InspectorFlowOption[];
  /** Channel of the account this flow belongs to; drives platform-specific warnings. */
  channel?: ChannelId;
}) {
  const channelLimits = CHANNELS[channel];
  const [flow, setFlow] = useState(initialFlow);
  const [view, setView] = useState<"canvas" | "list">("canvas");
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<CanvasValidation>({ errors: [], warnings: [] });
  const canvasRef = useRef<FlowCanvasHandle>(null);
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [stepStats, setStepStats] = useState<Record<string, { sent: number; clicks: number }>>({});
  const [flowStats, setFlowStats] = useState<{ runs: number; people: number; ctr: number; completionRate: number; clicks: number } | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        void api<{ flow: typeof flowStats; steps: typeof stepStats }>(`/api/flows/${initialFlow.id}/stats`)
          .then((data) => {
            setStepStats(data.steps);
            setFlowStats(data.flow);
          })
          .catch(() => undefined),
      0,
    );
    return () => clearTimeout(timer);
  }, [initialFlow.id]);

  // Stats are recorded per engine step; a Send Message node is several steps sharing a group id.
  const nodeStats = useMemo(() => {
    const byNode: Record<string, NodeStats> = {};
    for (const step of flow.definition.steps) {
      const stats = stepStats[step.id];
      if (!stats) continue;
      const key = ("group" in step && step.group) || step.id;
      const entry = (byNode[key] ??= { sent: 0, clicks: 0, ctr: 0 });
      entry.sent = Math.max(entry.sent, stats.sent);
      entry.clicks += stats.clicks;
    }
    for (const entry of Object.values(byNode)) entry.ctr = entry.sent ? Math.min(1, entry.clicks / entry.sent) : 0;
    return byNode;
  }, [flow.definition.steps, stepStats]);

  const pullCanvas = () => {
    const compiled = canvasRef.current?.getDefinition();
    if (!compiled) return flow;
    // Comment / story settings live beside the graph, not in it.
    const definition = flow.definition.trigger ? { ...compiled, trigger: flow.definition.trigger } : compiled;
    const next = { ...flow, definition };
    setFlow(next);
    return next;
  };

  const save = useCallback(async () => {
    const next = view === "canvas" ? pullCanvas() : flow;
    if (view === "canvas") {
      const current = canvasRef.current?.getValidation() ?? validation;
      if (current.errors.length) {
        toast.error(current.errors[0]);
        return;
      }
      if (current.warnings.length) {
        toast.message(current.warnings[0]);
      }
    }
    setSaving(true);
    try {
      const data = await api<{ flow: FlowEditorRecord }>(`/api/flows/${next.id}`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setFlow({ ...data.flow, botId: next.botId });
      toast.success("Flow saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [flow, validation, view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const remove = async () => {
    if (!window.confirm("Delete this flow?")) return;
    try {
      await api(`/api/flows/${flow.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      router.push("/flows");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const duplicate = async () => {
    try {
      const data = await api<{ flow: { id: string } }>(`/api/flows/${flow.id}/duplicate`, { method: "POST" });
      toast.success("Flow duplicated (inactive until you turn it on)");
      router.push(`/flows/${data.flow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Duplicate failed");
    }
  };

  const switchView = (next: "canvas" | "list") => {
    if (next === view) return;
    if (view === "canvas") pullCanvas();
    if (next === "canvas") setCanvasEpoch((value) => value + 1);
    setView(next);
  };

  const meta: FlowMeta = {
    name: flow.name,
    triggerType: flow.triggerType,
    triggerValue: flow.triggerValue,
    isActive: flow.isActive,
    trigger: flow.definition.trigger,
  };

  const onMetaChange = ({ trigger, ...patch }: Partial<FlowMeta>) => {
    setFlow((current) => ({
      ...current,
      ...patch,
      ...(trigger !== undefined ? { definition: { ...current.definition, trigger } } : {}),
    }));
  };

  const firstIssue = validation.errors[0] ?? validation.warnings[0];
  const extraIssues = validation.errors.length + validation.warnings.length - (firstIssue ? 1 : 0);
  const status = firstIssue
    ? extraIssues > 0
      ? `${firstIssue} (+${extraIssues} more)`
      : firstIssue
    : `Connect handles to set the next step. Drop an image or GIF onto a content node or the canvas. Editing for ${channelLimits.label}.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href="/flows" className="text-xs text-muted-foreground hover:text-foreground">
            ← Flows
          </Link>
          <h1 className="truncate font-heading text-xl tracking-tight">{flow.name || "Untitled flow"}</h1>
          <p
            className={cn(
              "mt-0.5 truncate text-[11px]",
              validation.errors.length
                ? "text-destructive"
                : validation.warnings.length
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
            )}
          >
            {status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                view === "canvas" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => switchView("canvas")}
            >
              Canvas
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                view === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => switchView("list")}
            >
              List
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setTesting((value) => !value)}>
            Test
          </Button>
          <FlowShareButton botId={flow.botId} flowId={flow.id} />
          <Button size="sm" variant="outline" onClick={() => void duplicate()}>
            Duplicate
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </header>

      {flowStats && flowStats.runs > 0 ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b bg-white px-4 py-1.5 text-[12px] text-[#6b7280] tabular-nums">
          <span>
            Runs <span className="font-semibold text-[#1b1f24]">{flowStats.runs}</span>
          </span>
          <span>
            People <span className="font-semibold text-[#1b1f24]">{flowStats.people}</span>
          </span>
          <span>
            Clicks <span className="font-semibold text-[#1b1f24]">{flowStats.clicks}</span> · CTR{" "}
            {Math.round(flowStats.ctr * 100)}%
          </span>
          <span>
            Completed <span className="font-semibold text-[#1b1f24]">{Math.round(flowStats.completionRate * 100)}%</span>
          </span>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
      {testing ? (
        <FlowSimulator
          onClose={() => setTesting(false)}
          getFlow={() => {
            // Read the canvas without committing it to state: the simulator calls this from event handlers.
            const compiled = view === "canvas" ? canvasRef.current?.getDefinition() : null;
            const definition = compiled ? { ...compiled, ...(flow.definition.trigger ? { trigger: flow.definition.trigger } : {}) } : flow.definition;
            return { id: flow.id, triggerType: flow.triggerType, triggerValue: flow.triggerValue, definition };
          }}
        />
      ) : null}
      <FlowStatsContext.Provider value={nodeStats}>
      {view === "canvas" ? (
        <FlowCanvasEditor
          key={canvasEpoch}
          channelLimits={channelLimits}
          ref={canvasRef}
          initialDefinition={flow.definition}
          meta={meta}
          customFields={customFields}
          tagNames={tagNames}
          otherFlows={otherFlows}
          onMetaChange={onMetaChange}
          onValidationChange={setValidation}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
          <FlowListEditor flow={flow} otherFlows={otherFlows} onChange={setFlow} />
        </div>
      )}
      </FlowStatsContext.Provider>
      </div>
    </div>
  );
}
