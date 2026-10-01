"use client";

import { Plus, X } from "lucide-react";
import { zernioPlatformLabel } from "@/components/chrome/platform-badge";
import type { Segment, SegmentCondition } from "@/lib/segments";

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

/** ManyChat-style condition builder: match all / any of tag, field, platform, list, activity, join date. */
export function SegmentBuilder({
  value,
  options,
  onChange,
}: {
  value: Segment;
  options: SegmentOptions;
  onChange: (next: Segment) => void;
}) {
  return (
    <div className="space-y-2">
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
