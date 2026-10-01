"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import type { FlowEditorRecord } from "@/lib/types";

type Version = { id: string; name: string; triggerType: string; triggerValue: string | null; author: string | null; createdAt: string; steps: number };

/** Saved versions of a flow (the state before each save), newest first, with restore. */
export function FlowHistory({
  flowId,
  onRestored,
  onClose,
}: {
  flowId: string;
  onRestored: (flow: FlowEditorRecord) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        void api<{ versions: Version[] }>(`/api/flows/${flowId}/versions`)
          .then((data) => setVersions(data.versions))
          .catch(() => setVersions([])),
      0,
    );
    return () => clearTimeout(timer);
  }, [flowId]);

  const restore = async (version: Version) => {
    if (!window.confirm(`Restore the version from ${new Date(version.createdAt).toLocaleString()}? The current flow is kept in history.`)) return;
    setBusy(true);
    try {
      const data = await api<{ flow: FlowEditorRecord }>(`/api/flows/${flowId}/versions/${version.id}`, { method: "POST" });
      toast.success("Version restored");
      onRestored(data.flow);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l bg-white shadow-xl">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <History className="size-4 text-[#7b61ff]" />
        <p className="flex-1 text-[14px] font-semibold">Version history</p>
        <Button size="icon-sm" variant="ghost" aria-label="Close history" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {versions === null ? (
          <p className="text-[13px] text-[#6b7280]">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-[13px] text-[#6b7280]">No earlier versions yet. Each save keeps the version it replaces (the last 20).</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center gap-2 rounded-xl p-3 ring-1 ring-[#e5e7eb]">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[#1b1f24]">{new Date(version.createdAt).toLocaleString()}</p>
                  <p className="truncate text-[12px] text-[#6b7280]">
                    {version.steps} steps · {version.triggerType}
                    {version.triggerValue ? ` “${version.triggerValue}”` : ""}
                    {version.author ? ` · ${version.author}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void restore(version)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
