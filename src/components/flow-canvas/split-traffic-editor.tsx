"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TWO_WAY_PRESETS,
  addSplitPath,
  applyTwoWaySplit,
  equalizeSplits,
  removeSplitPath,
  setSplitPercent,
  splitTotal,
} from "@/lib/ab-split";
import { cn } from "@/lib/utils";

export type SplitTrafficPath = {
  id: string;
  percent: number;
  next?: string;
};

export function SplitTrafficEditor({
  paths,
  showNext = false,
  onChange,
}: {
  paths: SplitTrafficPath[];
  showNext?: boolean;
  onChange: (paths: SplitTrafficPath[]) => void;
}) {
  const total = splitTotal(paths);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg bg-[#eef1f4]">
        <div className="flex h-2 w-full">
          {paths.map((path, index) => (
            <div
              key={path.id}
              className="h-full"
              style={{
                width: `${path.percent}%`,
                background: index === 0 ? "#E67700" : index === 1 ? "#0084FF" : "#7B61FF",
              }}
            />
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {paths
          .map((path, index) => `${path.percent}% goes to ${String.fromCharCode(65 + index)}`)
          .join(" · ")}
        {total !== 100 ? ` · totals ${total}%` : ""}
      </p>
      {paths.length === 2 ? (
        <div className="flex flex-wrap gap-1.5">
          {TWO_WAY_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="xs"
              variant={paths[0]?.percent === preset.first ? "default" : "outline"}
              onClick={() => onChange(applyTwoWaySplit(paths, preset.first))}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
      {paths.map((path, index) => (
        <div key={path.id} className="space-y-1.5 rounded-lg border border-[#e5e7eb] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {String.fromCharCode(65 + index)} gets {path.percent}%
            </p>
            {paths.length > 2 ? (
              <Button type="button" size="xs" variant="ghost" onClick={() => onChange(removeSplitPath(paths, index))}>
                Remove
              </Button>
            ) : null}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={path.percent}
            aria-label={`Traffic to path ${String.fromCharCode(65 + index)}`}
            className={cn("w-full accent-[#E67700]")}
            onChange={(event) => onChange(setSplitPercent(paths, index, Number(event.target.value)))}
          />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              className="w-20"
              value={path.percent}
              onChange={(event) =>
                onChange(setSplitPercent(paths, index, Number.parseInt(event.target.value, 10) || 0))
              }
            />
            <span className="text-xs text-muted-foreground">%</span>
            {showNext ? (
              <Input
                placeholder="Next step id"
                value={path.next ?? ""}
                onChange={(event) => {
                  const next = paths.slice();
                  next[index] = { ...path, next: event.target.value };
                  onChange(next);
                }}
              />
            ) : null}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {paths.length < 6 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange(addSplitPath(paths, { id: `path-${crypto.randomUUID().slice(0, 6)}`, percent: 0 }))
            }
          >
            Add variation
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(equalizeSplits(paths))}>
          Split evenly
        </Button>
      </div>
    </div>
  );
}
