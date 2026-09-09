import { describe, expect, it } from "vitest";
import { applyTwoWaySplit, equalizeSplits, setSplitPercent, splitTotal } from "@/lib/ab-split";
import { chooseRandomizerPath } from "@/lib/smart-delay";

describe("A/B traffic split", () => {
  it("keeps two paths at 100% when you drag one slider", () => {
    const start = [
      { id: "a", percent: 50 },
      { id: "b", percent: 50 },
    ];
    const next = setSplitPercent(start, 0, 70);
    expect(next.map((path) => path.percent)).toEqual([70, 30]);
    expect(splitTotal(next)).toBe(100);

    const reverse = setSplitPercent(next, 1, 40);
    expect(reverse.map((path) => path.percent)).toEqual([60, 40]);
  });

  it("rebalances three paths and equalizes a new variation", () => {
    const three = setSplitPercent(
      [
        { id: "a", percent: 34 },
        { id: "b", percent: 33 },
        { id: "c", percent: 33 },
      ],
      0,
      50,
    );
    expect(splitTotal(three)).toBe(100);
    expect(three[0]?.percent).toBe(50);

    const even = equalizeSplits([
      { id: "a", percent: 70 },
      { id: "b", percent: 20 },
      { id: "c", percent: 10 },
    ]);
    expect(even.map((path) => path.percent).sort()).toEqual([33, 33, 34]);
    expect(applyTwoWaySplit(even.slice(0, 2), 80).map((path) => path.percent)).toEqual([80, 20]);
  });

  it("sends 80% of rolls down path A", () => {
    const paths = [
      { id: "a", percent: 80, next: "one" },
      { id: "b", percent: 20, next: "two" },
    ];
    const hits = { a: 0, b: 0 };
    for (let i = 0; i < 100; i += 1) {
      const chosen = chooseRandomizerPath(paths, i / 100);
      if (chosen?.id === "a") hits.a += 1;
      else hits.b += 1;
    }
    expect(hits.a).toBe(80);
    expect(hits.b).toBe(20);
  });
});
