"use client";

import { useState } from "react";
import { PlatformDot, zernioPlatformLabel } from "@/components/chrome/platform-badge";

/** Series color for single-series charts (reference palette slot 1). Values and labels stay in ink. */
const SERIES = "#2a78d6";
const INK = "#1b1f24";
const MUTED = "#6b7280";

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value / 4)! * magnitude;
  return Math.ceil(value / step) * step;
}

function shortDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Daily columns with a hover tooltip. Thin bars, 2px gaps, rounded data ends on the baseline,
 * recessive gridlines, and a table fallback for screen readers.
 */
export function DailyColumns({ data, label }: { data: { day: string; count: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((point) => point.count)));
  const ticks = [0, max / 2, max];
  const active = hover === null ? null : data[hover];

  return (
    <figure className="space-y-2">
      <div className="relative h-44 pl-8">
        {ticks.map((tick) => (
          <div
            key={tick}
            className="pointer-events-none absolute right-0 left-8 border-t border-[#eef1f4]"
            style={{ bottom: `${(tick / max) * 100}%` }}
          >
            <span className="absolute -top-2 -left-8 w-6 text-right text-[10px] tabular-nums" style={{ color: MUTED }}>
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 left-8 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {data.map((point, index) => (
            <div
              key={point.day}
              className="flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              tabIndex={0}
              aria-label={`${shortDate(point.day)}: ${point.count}`}
            >
              <div
                className="w-full rounded-t-[4px] transition-opacity"
                style={{
                  height: point.count ? `max(${(point.count / max) * 100}%, 3px)` : "0px",
                  background: SERIES,
                  opacity: hover === null || hover === index ? 1 : 0.45,
                }}
              />
            </div>
          ))}
        </div>
        {active && hover !== null ? (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-lg bg-white px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-md ring-1 ring-[#e5e7eb]"
            style={{ left: `calc(2rem + (100% - 2rem) * ${(hover + 0.5) / data.length})` }}
          >
            <p style={{ color: MUTED }}>{shortDate(active.day)}</p>
            <p className="font-semibold tabular-nums" style={{ color: INK }}>
              {active.count} {label}
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex justify-between pl-8 text-[10px]" style={{ color: MUTED }}>
        <span>{data[0] ? shortDate(data[0].day) : ""}</span>
        <span>{data[Math.floor(data.length / 2)] ? shortDate(data[Math.floor(data.length / 2)]!.day) : ""}</span>
        <span>{data.at(-1) ? shortDate(data.at(-1)!.day) : ""}</span>
      </div>
      <table className="sr-only">
        <caption>{label} per day</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.day}</th>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Ranked horizontal bars (one hue). The label names the entity; the dot is only a hint. */
export function PlatformBars({ rows, fallbackLabel }: { rows: { platform: string | null; count: number }[]; fallbackLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
  return (
    <ul className="space-y-2.5" onMouseLeave={() => setHover(null)}>
      {rows.map((row, index) => (
        <li
          key={row.platform ?? "direct"}
          className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-[13px]"
          onMouseEnter={() => setHover(index)}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate" style={{ color: INK }}>
            {row.platform ? <PlatformDot platform={row.platform} /> : null}
            {row.platform ? zernioPlatformLabel(row.platform) : fallbackLabel}
          </span>
          <span className="h-2.5 rounded-full bg-[#f1f3f5]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, (row.count / max) * 100)}%`, background: SERIES, opacity: hover === null || hover === index ? 1 : 0.45 }}
            />
          </span>
          <span className="w-16 text-right tabular-nums" style={{ color: MUTED }}>
            {hover === index ? `${Math.round((row.count / total) * 100)}%` : row.count.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
