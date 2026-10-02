"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, Filter, Search, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { ContactAvatar } from "@/components/chrome/avatar";
import { PageHeader } from "@/components/chrome/page-header";
import { PlatformBadge } from "@/components/chrome/platform-badge";
import { SavedSegments, SegmentBuilder, type SegmentOptions } from "@/components/segment-builder";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { EMPTY_SEGMENT, matchesSegment, type Segment, type SegmentSubject } from "@/lib/segments";
import { cn } from "@/lib/utils";

export type ContactRow = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  platform: string | null;
  email: string | null;
  phone: string | null;
  unsubscribed: boolean;
  /** Lifetime value: sum of goal values reached. */
  value: number;
  createdAt: string;
  lastInboundAt: string | null;
  subject: SegmentSubject;
};

type BulkAction = "add_tag" | "remove_tag" | "send_flow" | "unsubscribe" | "delete";

const PAGE = 100;

function ago(iso: string | null, now: number) {
  if (!iso) return "—";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

export function ContactsClient({
  botId,
  initialRows,
  options,
  flows,
}: {
  botId: string;
  initialRows: ContactRow[];
  options: SegmentOptions;
  flows: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>(EMPTY_SEGMENT);
  const [showFilter, setShowFilter] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [action, setAction] = useState<BulkAction>("add_tag");
  const [actionValue, setActionValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  // One clock per page load keeps filtering and "x ago" consistent (and render pure).
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialRows.filter(
      (row) =>
        matchesSegment(row.subject, segment, now) &&
        (!needle ||
          [row.name, row.username, row.email, row.phone].some((value) => (value ?? "").toLowerCase().includes(needle)) ||
          row.subject.tags.some((tag) => tag.toLowerCase().includes(needle))),
    );
  }, [initialRows, query, segment, now]);
  const [sortBy, setSortBy] = useState<"recent" | "value">("recent");
  const sorted = useMemo(() => (sortBy === "value" ? [...filtered].sort((a, b) => b.value - a.value) : filtered), [filtered, sortBy]);
  const visible = sorted.slice(0, limit);
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = async () => {
    const ids = [...selected];
    if (action === "delete" && !window.confirm(`Delete ${ids.length} contact${ids.length === 1 ? "" : "s"} and their conversations?`)) return;
    setBusy(true);
    try {
      const data = await api<{ affected: number; failed?: number; error?: string | null }>("/api/contacts/bulk", {
        method: "POST",
        body: JSON.stringify({ botId, contactIds: ids, action, value: action === "send_flow" ? actionValue || flows[0]?.id : actionValue, confirm: action === "delete" ? true : undefined }),
      });
      toast.success(`Done for ${data.affected} contact${data.affected === 1 ? "" : "s"}${data.failed ? ` (${data.failed} failed: ${data.error})` : ""}`);
      setSelected(new Set());
      setActionValue("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const csv = await file.text();
      const data = await api<{ created: number; updated: number; skipped: number }>("/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({ botId, csv, tag: "imported" }),
      });
      toast.success(`Imported: ${data.created} new, ${data.updated} updated, ${data.skipped} skipped`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Contacts"
        icon={Users}
        tone="input"
        description="Everyone who has messaged, commented or been imported, across every connected account."
        actions={
          <>
            <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium ring-1 ring-[#e5e7eb] hover:bg-[#f4f6f8]", importing && "opacity-50")}>
              <Upload className="size-3.5" />
              {importing ? "Importing…" : "Import CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCsv(file);
                  event.target.value = "";
                }}
              />
            </label>
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/contacts/export?botId=${botId}`} />}>
              <Download className="size-3.5" />
              Export
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-[#e5e7eb]">
          <Search className="size-3.5 text-[#8b95a1]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, @username, email, phone or tag"
            className="w-full bg-transparent text-[13px] outline-none"
          />
        </div>
        <Button variant={segment.conditions.length ? "default" : "outline"} size="sm" onClick={() => setShowFilter((value) => !value)}>
          <Filter className="size-3.5" />
          Filter{segment.conditions.length ? ` (${segment.conditions.length})` : ""}
        </Button>
      </div>

      {showFilter ? (
        <div className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb]">
          <SegmentBuilder value={segment} options={options} onChange={setSegment} showSaved={false} />
        </div>
      ) : null}

      <SavedSegments value={segment} onChange={(next) => setSegment(next)} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <p className="text-[#6b7280]">
          {filtered.length.toLocaleString()} of {initialRows.length.toLocaleString()} contacts
          {selected.size ? ` · ${selected.size} selected` : ""}
        </p>
        {selected.size ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Bulk action"
              className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5"
              value={action}
              onChange={(event) => {
                setAction(event.target.value as BulkAction);
                setActionValue("");
              }}
            >
              <option value="add_tag">Add tag</option>
              <option value="remove_tag">Remove tag</option>
              <option value="send_flow" disabled={flows.length === 0}>
                Send flow
              </option>
              <option value="unsubscribe">Unsubscribe</option>
              <option value="delete">Delete</option>
            </select>
            {action === "add_tag" || action === "remove_tag" ? (
              <input
                list="bulk-tags"
                aria-label="Tag"
                value={actionValue}
                onChange={(event) => setActionValue(event.target.value)}
                placeholder="Tag"
                className="w-32 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5"
              />
            ) : null}
            <datalist id="bulk-tags">
              {options.tags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
            {action === "send_flow" ? (
              <select
                aria-label="Flow"
                className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5"
                value={actionValue || flows[0]?.id}
                onChange={(event) => setActionValue(event.target.value)}
              >
                {flows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              size="sm"
              variant={action === "delete" ? "destructive" : "default"}
              disabled={busy || ((action === "add_tag" || action === "remove_tag") && !actionValue.trim())}
              onClick={() => void runBulk()}
            >
              Apply to {selected.size}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb]">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-left text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={allVisibleSelected}
                  onChange={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      for (const row of visible) {
                        if (allVisibleSelected) next.delete(row.id);
                        else next.add(row.id);
                      }
                      return next;
                    })
                  }
                />
              </th>
              <th className="px-2 py-2.5">Contact</th>
              <th className="px-3 py-2.5">Email / phone</th>
              <th className="px-3 py-2.5">Tags</th>
              <th className="px-3 py-2.5 text-right">
                <button type="button" onClick={() => setSortBy(sortBy === "value" ? "recent" : "value")} className={cn("uppercase", sortBy === "value" && "text-[#0084ff]")}>
                  Value {sortBy === "value" ? "↓" : ""}
                </button>
              </th>
              <th className="px-3 py-2.5 text-right">
                <button type="button" onClick={() => setSortBy("recent")} className={cn("uppercase", sortBy === "recent" && "text-[#0084ff]")}>
                  Last message {sortBy === "recent" ? "↓" : ""}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#6b7280]">
                  {initialRows.length === 0 ? "No contacts yet. They appear as soon as someone messages or comments." : "Nobody matches."}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className={cn("border-b border-[#f0f2f4] last:border-0", selected.has(row.id) ? "bg-[#eef6ff]" : "hover:bg-[#f9fafb]")}>
                  <td className="px-4 py-2">
                    <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/contacts/${row.id}`} className="flex items-center gap-2.5">
                      <ContactAvatar name={row.name} src={row.avatarUrl} platform={row.platform} className="size-8" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[#1b1f24]">{row.name}</span>
                        <span className="flex items-center gap-1.5 text-[11px] text-[#6b7280]">
                          <PlatformBadge platform={row.platform} />
                          {row.username ? `@${row.username}` : null}
                          {row.unsubscribed ? <span className="text-amber-600">unsubscribed</span> : null}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[#6b7280]">
                    <span className="block truncate">{row.email ?? "—"}</span>
                    <span className="block truncate text-[11px]">{row.phone ?? ""}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex max-w-64 flex-wrap gap-1">
                      {row.subject.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded-full bg-[#f1ecff] px-2 py-0.5 text-[11px] text-[#5f3dc4]">
                          {tag}
                        </span>
                      ))}
                      {row.subject.tags.length > 4 ? <span className="text-[11px] text-[#8b95a1]">+{row.subject.tags.length - 4}</span> : null}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#1b1f24]">
                    {row.value ? row.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : <span className="text-[#c5cdd6]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[#6b7280] tabular-nums">{ago(row.lastInboundAt, now)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > limit ? (
        <Button variant="outline" onClick={() => setLimit((value) => value + PAGE)}>
          Show more
        </Button>
      ) : null}
    </div>
  );
}
