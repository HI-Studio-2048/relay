export type SplitPath = {
  id: string;
  percent: number;
};

function roundShares(weights: number[], total: number): number[] {
  if (weights.length === 0) return [];
  if (weights.length === 1) return [total];
  const sum = weights.reduce((acc, value) => acc + value, 0);
  const raw =
    sum <= 0
      ? weights.map(() => total / weights.length)
      : weights.map((value) => (value / sum) * total);
  const floored = raw.map((value) => Math.floor(value));
  let used = floored.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - floored[index]! }))
    .sort((a, b) => b.frac - a.frac);
  const next = floored.slice();
  let cursor = 0;
  while (used < total && cursor < order.length * 2) {
    const slot = order[cursor % order.length]!.index;
    next[slot] = (next[slot] ?? 0) + 1;
    used += 1;
    cursor += 1;
  }
  return next;
}

/** Drag one path's %; the rest rebalance so traffic always totals 100. */
export function setSplitPercent<T extends SplitPath>(paths: T[], index: number, percent: number): T[] {
  if (paths.length === 0) return paths;
  if (index < 0 || index >= paths.length) return paths;
  if (paths.length === 1) return [{ ...paths[0]!, percent: 100 }];
  const next = Math.max(0, Math.min(100, Math.round(percent)));
  const leftover = 100 - next;
  const others = paths.map((path, i) => (i === index ? 0 : path.percent));
  const shares = roundShares(
    others.filter((_, i) => i !== index),
    leftover,
  );
  let otherIndex = 0;
  return paths.map((path, i) => {
    if (i === index) return { ...path, percent: next };
    const percentShare = shares[otherIndex] ?? 0;
    otherIndex += 1;
    return { ...path, percent: percentShare };
  });
}

export function equalizeSplits<T extends SplitPath>(paths: T[]): T[] {
  const shares = roundShares(
    paths.map(() => 1),
    100,
  );
  return paths.map((path, index) => ({ ...path, percent: shares[index] ?? 0 }));
}

export function applyTwoWaySplit<T extends SplitPath>(paths: T[], firstPercent: number): T[] {
  if (paths.length < 2) return equalizeSplits(paths);
  return setSplitPercent(paths, 0, firstPercent);
}

export function addSplitPath<T extends SplitPath>(paths: T[], path: T, max = 6): T[] {
  if (paths.length >= max) return paths;
  return equalizeSplits([...paths, path]);
}

export function removeSplitPath<T extends SplitPath>(paths: T[], index: number): T[] {
  if (paths.length <= 2) return paths;
  return equalizeSplits(paths.filter((_, i) => i !== index));
}

export function splitTotal(paths: { percent: number }[]): number {
  return paths.reduce((sum, path) => sum + Math.max(0, path.percent || 0), 0);
}

export const TWO_WAY_PRESETS = [
  { label: "50 / 50", first: 50 },
  { label: "70 / 30", first: 70 },
  { label: "80 / 20", first: 80 },
  { label: "90 / 10", first: 90 },
] as const;
