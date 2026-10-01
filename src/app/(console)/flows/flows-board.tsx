"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Folder, LayoutTemplate, Plus, Search, Sparkles, Workflow } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/page-header";
import { PlatformDot } from "@/components/chrome/platform-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { FLOW_TEMPLATES, type FlowTemplate } from "@/lib/flow-templates";
import { TRIGGER_OPTIONS } from "@/lib/types";
import { cn } from "@/lib/utils";

type FlowStats = {
  runs: number;
  people: number;
  sent: number;
  clicks: number;
  completed: number;
  ctr: number;
  completionRate: number;
  conversions: number;
  revenue: number;
};

type FlowRow = {
  id: string;
  name: string;
  triggerType: string;
  triggerValue: string | null;
  isActive: boolean;
  folder: string | null;
  updatedAt: string;
  stats: FlowStats | null;
};

const GROUPS: { value: string; label: string; match: (type: string) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "social", label: "Comments & stories", match: (type) => ["comment", "story_reply", "story_mention"].includes(type) },
  { value: "keywords", label: "Keywords", match: (type) => type.startsWith("keyword") || type === "command" || type === "intent" },
  { value: "welcome", label: "Welcome & links", match: (type) => type === "start" || type === "start_param" || type === "default" },
];

function triggerLabel(flow: Pick<FlowRow, "triggerType" | "triggerValue">) {
  const label = TRIGGER_OPTIONS.find((option) => option.value === flow.triggerType)?.label ?? flow.triggerType;
  return flow.triggerValue && flow.triggerType !== "start" ? `${label}: ${flow.triggerValue}` : label;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

function TemplateCard({ template, onUse, busy }: { template: FlowTemplate; onUse: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb]">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
            template.category === "AI" ? "bg-[#fdf4ff] text-[#a21caf]" : template.category === "Instagram growth" ? "bg-[#fff0f6] text-[#c2255c]" : "bg-[#eef6ff] text-[#0b63c5]",
          )}
        >
          {template.category}
        </span>
        <span className="flex gap-1">
          {template.channels.map((channel) => (
            <PlatformDot key={channel} platform={channel} />
          ))}
        </span>
      </div>
      <p className="font-heading text-[15px] text-[#1b1f24]">{template.name}</p>
      <p className="flex-1 text-[13px] leading-snug text-[#6b7280]">{template.description}</p>
      <Button size="sm" variant="outline" disabled={busy} onClick={onUse}>
        Use template
      </Button>
    </div>
  );
}

export function FlowsBoard({ botId, flows }: { botId: string; flows: FlowRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(flows);
  const [group, setGroup] = useState("all");
  const [folder, setFolder] = useState<string>("*");
  const folders = useMemo(
    () => [...new Set(rows.map((flow) => flow.folder).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const [query, setQuery] = useState("");
  const [showTemplates, setShowTemplates] = useState(flows.length < 3);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = GROUPS.find((item) => item.value === group)!.match;
    return rows.filter(
      (flow) =>
        match(flow.triggerType) &&
        (folder === "*" || (folder === "" ? !flow.folder : flow.folder === folder)) &&
        (!needle || flow.name.toLowerCase().includes(needle) || (flow.triggerValue ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, group, query, folder]);

  const moveToFolder = async (flow: FlowRow, choice: string) => {
    let next: string | null = choice || null;
    if (choice === "__new") {
      const name = window.prompt("New folder name")?.trim();
      if (!name) return;
      next = name.slice(0, 60);
    }
    setRows((current) => current.map((item) => (item.id === flow.id ? { ...item, folder: next } : item)));
    try {
      await api(`/api/flows/${flow.id}`, { method: "PATCH", body: JSON.stringify({ folder: next }) });
    } catch (error) {
      setRows((current) => current.map((item) => (item.id === flow.id ? { ...item, folder: flow.folder } : item)));
      toast.error(error instanceof Error ? error.message : "Could not move");
    }
  };

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, flow) => ({
          runs: sum.runs + (flow.stats?.runs ?? 0),
          clicks: sum.clicks + (flow.stats?.clicks ?? 0),
          completed: sum.completed + (flow.stats?.completed ?? 0),
          conversions: sum.conversions + (flow.stats?.conversions ?? 0),
          revenue: sum.revenue + (flow.stats?.revenue ?? 0),
          active: sum.active + (flow.isActive ? 1 : 0),
        }),
        { runs: 0, clicks: 0, completed: 0, active: 0, conversions: 0, revenue: 0 },
      ),
    [rows],
  );

  const create = async () => {
    setBusy(true);
    try {
      const data = await api<{ flow: { id: string } }>("/api/flows", {
        method: "POST",
        body: JSON.stringify({ botId, name: "Untitled flow", triggerType: "keyword_contains", triggerValue: "" }),
      });
      router.push(`/flows/${data.flow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create flow");
      setBusy(false);
    }
  };

  const installTemplate = async (templateId: string) => {
    setBusy(true);
    try {
      const data = await api<{ flow: { id: string } }>("/api/flows/from-template", {
        method: "POST",
        body: JSON.stringify({ botId, templateId }),
      });
      toast.success("Template added — review it, then switch it on");
      router.push(`/flows/${data.flow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add template");
      setBusy(false);
    }
  };

  const toggle = async (flow: FlowRow) => {
    setRows((current) => current.map((item) => (item.id === flow.id ? { ...item, isActive: !flow.isActive } : item)));
    try {
      await api(`/api/flows/${flow.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !flow.isActive }) });
    } catch (error) {
      setRows((current) => current.map((item) => (item.id === flow.id ? { ...item, isActive: flow.isActive } : item)));
      toast.error(error instanceof Error ? error.message : "Could not update");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Automate"
        title="Flows"
        icon={Workflow}
        tone="content"
        description="Every automation: comment-to-DM, story replies, keywords, welcome messages and growth links. Open one to edit it on the canvas."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowTemplates((value) => !value)}>
              <LayoutTemplate className="size-3.5" />
              Templates
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/ai" />}>
              <Sparkles className="size-3.5 text-[#d946ef]" />
              Build with AI
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void create()}>
              <Plus className="size-3.5" />
              New flow
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active flows", value: `${totals.active}/${rows.length}` },
          { label: "Runs", value: totals.runs.toLocaleString() },
          { label: "Button clicks", value: totals.clicks.toLocaleString() },
          {
            label: "Conversions",
            value: totals.revenue
              ? `${totals.conversions.toLocaleString()} · ${totals.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : totals.conversions.toLocaleString(),
          },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb]">
            <p className="text-[11px] font-medium text-[#6b7280]">{tile.label}</p>
            <p className="font-heading text-xl tabular-nums text-[#1b1f24]">{tile.value}</p>
          </div>
        ))}
      </div>

      {showTemplates ? (
        <section className="space-y-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">Start from a template</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FLOW_TEMPLATES.map((template) => (
              <TemplateCard key={template.id} template={template} busy={busy} onUse={() => void installTemplate(template.id)} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {GROUPS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setGroup(item.value)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[12px] font-medium",
                group === item.value ? "bg-[#1b1f24] text-white" : "bg-white text-[#6b7280] ring-1 ring-[#e5e7eb] hover:text-[#1b1f24]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-[#e5e7eb] sm:w-64">
          <Search className="size-3.5 text-[#8b95a1]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search flows"
            className="w-full bg-transparent text-[13px] outline-none"
          />
        </div>
      </div>

      {folders.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Folder className="size-3.5 text-[#8b95a1]" />
          {[
            { value: "*", label: "All folders", count: rows.length },
            ...folders.map((name) => ({ value: name, label: name, count: rows.filter((flow) => flow.folder === name).length })),
            { value: "", label: "Unfiled", count: rows.filter((flow) => !flow.folder).length },
          ].map((item) => (
            <button
              key={item.value || "unfiled"}
              type="button"
              onClick={() => setFolder(item.value)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[12px]",
                folder === item.value ? "bg-[#eef6ff] font-medium text-[#0b63c5] ring-1 ring-[#0084ff]/30" : "text-[#6b7280] hover:bg-white",
              )}
            >
              {item.label} <span className="tabular-nums opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-[13px] text-[#6b7280] ring-1 ring-[#e5e7eb]">
          {rows.length === 0 ? "No flows yet — start from a template above." : "No flows match."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb]">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-[#e5e7eb] text-left text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">
                <th className="px-4 py-2.5">Flow</th>
                <th className="px-3 py-2.5 text-right">Runs</th>
                <th className="px-3 py-2.5 text-right">CTR</th>
                <th className="px-3 py-2.5 text-right">Completed</th>
                <th className="px-3 py-2.5 text-right">Goals</th>
                <th className="px-3 py-2.5">Folder</th>
                <th className="px-4 py-2.5 text-right">On</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((flow) => (
                <tr key={flow.id} className="border-b border-[#f0f2f4] last:border-0 hover:bg-[#f9fafb]">
                  <td className="px-4 py-2.5">
                    <Link href={`/flows/${flow.id}`} className="block">
                      <p className="font-medium text-[#1b1f24]">{flow.name}</p>
                      <p className="truncate text-[12px] text-[#6b7280]">{triggerLabel(flow)}</p>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{flow.stats?.runs ?? 0}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{flow.stats?.clicks ? pct(flow.stats.ctr) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{flow.stats?.runs ? pct(flow.stats.completionRate) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {flow.stats?.conversions ? (
                      <>
                        {flow.stats.conversions}
                        {flow.stats.revenue ? <span className="block text-[11px] text-[#6b7280]">{flow.stats.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      aria-label={`Folder for ${flow.name}`}
                      value={flow.folder ?? ""}
                      onChange={(event) => void moveToFolder(flow, event.target.value)}
                      className="field-sizing-content max-w-[9rem] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-[#6b7280] hover:border-[#e5e7eb]"
                    >
                      <option value="">—</option>
                      {folders.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value="__new">New folder…</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={flow.isActive}
                      aria-label={`${flow.isActive ? "Turn off" : "Turn on"} ${flow.name}`}
                      onClick={() => void toggle(flow)}
                      className={cn("relative inline-flex h-5 w-9 rounded-full transition-colors", flow.isActive ? "bg-[#00c853]" : "bg-[#d1d5db]")}
                    >
                      <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", flow.isActive ? "left-[18px]" : "left-0.5")} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
