"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FlowListEditor } from "@/components/flow-canvas/flow-list-editor";
import { FlowShareButton } from "@/components/flow-canvas/flow-share-dialog";
import type { FlowCanvasHandle } from "@/components/flow-canvas/flow-canvas-editor";
import type { FlowMeta, InspectorField } from "@/components/flow-canvas/node-inspector";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
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
}: {
  initialFlow: FlowEditorRecord;
  customFields: InspectorField[];
  tagNames: string[];
}) {
  const [flow, setFlow] = useState(initialFlow);
  const [view, setView] = useState<"canvas" | "list">("canvas");
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<CanvasValidation>({ errors: [], warnings: [] });
  const canvasRef = useRef<FlowCanvasHandle>(null);
  const router = useRouter();

  const pullCanvas = () => {
    const definition = canvasRef.current?.getDefinition();
    if (!definition) return flow;
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

  const firstIssue = validation.errors[0] ?? validation.warnings[0];
  const extraIssues = validation.errors.length + validation.warnings.length - (firstIssue ? 1 : 0);
  const status = firstIssue
    ? extraIssues > 0
      ? `${firstIssue} (+${extraIssues} more)`
      : firstIssue
    : "Connect handles to set the next step. Drop an image or GIF onto a content node or the canvas.";

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
          <FlowShareButton botId={flow.botId} flowId={flow.id} />
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
          onValidationChange={setValidation}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
          <FlowListEditor flow={flow} onChange={setFlow} />
        </div>
      )}
    </div>
  );
}
