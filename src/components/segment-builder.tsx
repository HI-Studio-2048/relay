"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useBot } from "@/components/bot-provider";
import { zernioPlatformLabel } from "@/components/chrome/platform-badge";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { SavedSegment, Segment, SegmentCondition } from "@/lib/segments";

export type SegmentOptions = {
  tags: string[];
  fields: string[];
  lists: string[];
  platforms: string[];
};

const KINDS: { value: SegmentCondition["kind"]; label: string }[] = [
  { value: "tag", label: "Tag" },
  { value: "field", label: "Field" },
  { value: "platform", label: "Platform" },
  { value: "list", label: "List" },
  { value: "active", label: "Last message" },
  { value: "joined", label: "Joined" },
];

const selectClass = "rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-[13px]";

function blank(kind: SegmentCondition["kind"], options: SegmentOptions): SegmentCondition {
  if (kind === "tag") return { kind, op: "has", value: options.tags[0] ?? "" };
  if (kind === "field") return { kind, key: options.fields[0] ?? "email", op: "set" };
  if (kind === "platform") return { kind, op: "is", value: options.platforms[0] ?? "instagram" };
  if (kind === "list") return { kind, op: "in", value: options.lists[0] ?? "" };
  if (kind === "active") return { kind, op: "within", hours: 24 };
  return { kind: "joined", op: "within", days: 7 };
}

function ConditionRow({
  condition,
  options,
  onChange,
  onRemove,
}: {
  condition: SegmentCondition;
  options: SegmentOptions;
  onChange: (next: SegmentCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Condition type"
        className={selectClass}
        value={condition.kind}
        onChange={(event) => onChange(blank(event.target.value as SegmentCondition["kind"], options))}
      >
        {KINDS.map((kind) => (
          <option key={kind.value} value={kind.value}>
            {kind.label}
          </option>
        ))}
      </select>

      {condition.kind === "tag" ? (
        <>
          <select aria-label="Operator" className={selectClass} value={condition.op} onChange={(event) => onChange({ ...condition, op: event.target.value as "has" })}>
            <option value="has">is applied</option>
            <option value="not">is not applied</option>
          </select>
          <input
            list="segment-tags"
            aria-label="Tag"
            className={`${selectClass} w-36`}
            value={condition.value}
            onChange={(event) => onChange({ ...condition, value: event.target.value })}
          />
        </>
      ) : null}

      {condition.kind === "field" ? (
        <>
          <input
            list="segment-fields"
            aria-label="Field"
            className={`${selectClass} w-32`}
            value={condition.key}
            onChange={(event) => onChange({ ...condition, key: event.target.value })}
          />
          <select aria-label="Operator" className={selectClass} value={condition.op} onChange={(event) => onChange({ ...condition, op: event.target.value as "eq" })}>
            <option value="set">has any value</option>
            <option value="not_set">is empty</option>
            <option value="eq">is</option>
            <option value="contains">contains</option>
          </select>
          {condition.op === "eq" || condition.op === "contains" ? (
            <input
              aria-label="Value"
              className={`${selectClass} w-32`}
              value={condition.value ?? ""}
              onChange={(event) => onChange({ ...condition, value: event.target.value })}
            />
          ) : null}
        </>
      ) : null}

      {condition.kind === "platform" ? (
        <>
          <select aria-label="Operator" className={selectClass} value={condition.op} onChange={(event) => onChange({ ...condition, op: event.target.value as "is" })}>
            <option value="is">is</option>
            <option value="not">is not</option>
          </select>
          <select aria-label="Platform" className={selectClass} value={condition.value} onChange={(event) => onChange({ ...condition, value: event.target.value })}>
            {[...new Set([...options.platforms, condition.value])].map((platform) => (
              <option key={platform} value={platform}>
                {zernioPlatformLabel(platform)}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {condition.kind === "list" ? (
        <>
          <select aria-label="Operator" className={selectClass} value={condition.op} onChange={(event) => onChange({ ...condition, op: event.target.value as "in" })}>
            <option value="in">subscribed to</option>
            <option value="not">not subscribed to</option>
          </select>
          <input
            list="segment-lists"
            aria-label="List"
            className={`${selectClass} w-36`}
            value={condition.value}
            onChange={(event) => onChange({ ...condition, value: event.target.value })}
          />
        </>
      ) : null}

      {condition.kind === "active" ? (
        <>
          <select aria-label="Operator" className={selectClass} value={condition.op} onChange={(event) => onChange({ ...condition, op: event.target.value as "within" })}>
            <option value="within">within the last</option>
            <option value="not_within">more than</option>
          </select>
          <input
            type="number"
            min={1}
            aria-label="Hours"
            className={`${selectClass} w-20`}
            value={condition.hours}
            onChange={(event) => onChange({ ...condition, hours: Number(event.target.value) || 1 })}
          />
          <span className="text-[13px] text-[#6b7280]">hours{condition.op === "not_within" ? " ago" : ""}</span>
        </>
      ) : null}

      {condition.kind === "joined" ? (
        <>
          <select aria-label="Operator" className={selectClass} value={condition.op} onChange={(event) => onChange({ ...condition, op: event.target.value as "within" })}>
            <option value="within">in the last</option>
            <option value="not_within">more than</option>
          </select>
          <input
            type="number"
            min={1}
            aria-label="Days"
            className={`${selectClass} w-20`}
            value={condition.days}
            onChange={(event) => onChange({ ...condition, days: Number(event.target.value) || 1 })}
          />
          <span className="text-[13px] text-[#6b7280]">days{condition.op === "not_within" ? " ago" : ""}</span>
        </>
      ) : null}

      <button type="button" aria-label="Remove condition" className="rounded p-1 text-[#8b95a1] hover:text-[#1b1f24]" onClick={onRemove}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Saved audiences: one tap applies one, "Save" names the current conditions. */
export function SavedSegments({ value, onChange }: { value: Segment; onChange: (next: Segment) => void }) {
  const { botId } = useBot();
  const [saved, setSaved] = useState<SavedSegment[]>([]);

  useEffect(() => {
    if (!botId) return;
    let cancelled = false;
    api<{ segments: SavedSegment[] }>(`/api/bots/${botId}/segments`)
      .then((data) => {
        if (!cancelled) setSaved(data.segments);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [botId]);

  const current = JSON.stringify(value);
  const save = async () => {
    const name = window.prompt("Name this segment", "")?.trim();
    if (!name || !botId) return;
    try {
      const data = await api<{ segments: SavedSegment[] }>(`/api/bots/${botId}/segments`, {
        method: "POST",
        body: JSON.stringify({ name, segment: value }),
      });
      setSaved(data.segments);
      toast.success(`Saved “${name}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  };
  const remove = async (item: SavedSegment) => {
    if (!botId || !window.confirm(`Delete the saved segment “${item.name}”?`)) return;
    const data = await api<{ segments: SavedSegment[] }>(`/api/bots/${botId}/segments?segmentId=${item.id}`, { method: "DELETE" }).catch(() => null);
    if (data) setSaved(data.segments);
  };

  if (saved.length === 0 && value.conditions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {saved.map((item) => {
        const active = JSON.stringify(item.segment) === current;
        return (
          <span
            key={item.id}
            className={cn(
              "flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-[12px] ring-1",
              active ? "bg-[#eef6ff] text-[#0b63c5] ring-[#0084ff]/40" : "bg-white text-[#374151] ring-[#e5e7eb]",
            )}
          >
            <button type="button" title={active ? "Clear this filter" : "Apply this segment"} onClick={() => onChange(active ? { match: "all", conditions: [] } : item.segment)}>
              {item.name}
            </button>
            <button type="button" aria-label={`Delete ${item.name}`} title="Delete saved segment" className="rounded-full p-0.5 text-[#8b95a1] hover:text-[#1b1f24]" onClick={() => void remove(item)}>
              <X className="size-3" />
            </button>
          </span>
        );
      })}
      {value.conditions.length > 0 && !saved.some((item) => JSON.stringify(item.segment) === current) ? (
        <button type="button" onClick={() => void save()} className="rounded-full px-2.5 py-0.5 text-[12px] font-medium text-[#0084ff] ring-1 ring-dashed ring-[#0084ff]/40 hover:bg-[#eef6ff]">
          Save as segment
        </button>
      ) : null}
    </div>
  );
}

/** ManyChat-style condition builder: match all / any of tag, field, platform, list, activity, join date. */
export function SegmentBuilder({
  value,
  options,
  onChange,
  showSaved = true,
}: {
  value: Segment;
  options: SegmentOptions;
  onChange: (next: Segment) => void;
  /** Show saved-segment chips above the conditions (off where the page shows them elsewhere). */
  showSaved?: boolean;
}) {
  return (
    <div className="space-y-2">
      {showSaved ? <SavedSegments value={value} onChange={onChange} /> : null}
      <datalist id="segment-tags">
        {options.tags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <datalist id="segment-fields">
        {["email", "phone", "first_name", "last_name", ...options.fields].map((field) => (
          <option key={field} value={field} />
        ))}
      </datalist>
      <datalist id="segment-lists">
        {options.lists.map((list) => (
          <option key={list} value={list} />
        ))}
      </datalist>
      {value.conditions.length > 1 ? (
        <p className="text-[13px] text-[#6b7280]">
          Match{" "}
          <select
            aria-label="Match mode"
            className={selectClass}
            value={value.match}
            onChange={(event) => onChange({ ...value, match: event.target.value === "any" ? "any" : "all" })}
          >
            <option value="all">all</option>
            <option value="any">any</option>
          </select>{" "}
          of these conditions
        </p>
      ) : null}
      {value.conditions.map((condition, index) => (
        <ConditionRow
          key={index}
          condition={condition}
          options={options}
          onChange={(next) => onChange({ ...value, conditions: value.conditions.map((item, i) => (i === index ? next : item)) })}
          onRemove={() => onChange({ ...value, conditions: value.conditions.filter((_, i) => i !== index) })}
        />
      ))}
      <button
        type="button"
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-[#0084ff] hover:bg-[#eef6ff]"
        onClick={() => onChange({ ...value, conditions: [...value.conditions, blank("tag", options)] })}
      >
        <Plus className="size-3.5" />
        Add condition
      </button>
    </div>
  );
}
