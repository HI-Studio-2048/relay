"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FlowListEditor } from "@/components/flow-canvas/flow-list-editor";
import type { FlowCanvasHandle } from "@/components/flow-canvas/flow-canvas-editor";
import type { FlowMeta, InspectorField } from "@/components/flow-canvas/node-inspector";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
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
}: {
  initialFlow: FlowEditorRecord;
  customFields: InspectorField[];
  tagNames: string[];
}) {
  const [flow, setFlow] = useState(initialFlow);
  const [view, setView] = useState<"canvas" | "list">("canvas");
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<FlowCanvasHandle>(null);
  const router = useRouter();

  const pullCanvas = () => {
    const definition = canvasRef.current?.getDefinition();
    if (!definition) return flow;
    const next = { ...flow, definition };
    setFlow(next);
    return next;
  };

  const save = async () => {
    const next = view === "canvas" ? pullCanvas() : flow;
    if (view === "canvas") {
      const validation = canvasRef.current?.getValidation();
      if (validation?.errors.length) {
        toast.error(validation.errors[0]);
        return;
      }
      if (validation?.warnings.length) {
        toast.message(validation.warnings[0]);
      }
    }
    setSaving(true);
    try {
      const data = await api<{ flow: FlowEditorRecord }>(`/api/flows/${next.id}`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setFlow({ ...data.flow, botId: next.botId });
      if (view === "canvas") setCanvasEpoch((value) => value + 1);
      toast.success("Flow saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this flow?")) return;
    try {
      await api(`/api/flows/${flow.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      router.push("/flows");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
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
  };

  const onMetaChange = (patch: Partial<FlowMeta>) => {
    setFlow((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href="/flows" className="text-xs text-muted-foreground hover:text-foreground">
            ← Flows
          </Link>
          <h1 className="truncate font-heading text-xl tracking-tight">{flow.name || "Untitled flow"}</h1>
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
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </header>

      {view === "canvas" ? (
        <FlowCanvasEditor
          key={canvasEpoch}
          ref={canvasRef}
          initialDefinition={flow.definition}
          meta={meta}
          customFields={customFields}
          tagNames={tagNames}
          onMetaChange={onMetaChange}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
          <FlowListEditor flow={flow} onChange={setFlow} />
        </div>
      )}
    </div>
  );
}
