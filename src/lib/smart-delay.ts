export type DelayUnit = "seconds" | "minutes" | "hours" | "days";

export const DELAY_UNITS: { value: DelayUnit; label: string; seconds: number }[] = [
  { value: "seconds", label: "Seconds", seconds: 1 },
  { value: "minutes", label: "Minutes", seconds: 60 },
  { value: "hours", label: "Hours", seconds: 3600 },
  { value: "days", label: "Days", seconds: 86400 },
];

export function delaySecondsFromUnit(amount: number, unit: DelayUnit = "seconds"): number {
  const factor = DELAY_UNITS.find((item) => item.value === unit)?.seconds ?? 1;
  return Math.max(0, Math.floor(amount || 0) * factor);
}

export function parseClock(value: string | null | undefined): { hours: number; minutes: number } | null {
  const match = (value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Move `due` into [sendAfter, sendBefore) using the contact/account local clock. */
export function applySendWindow(due: Date, sendAfter?: string | null, sendBefore?: string | null): Date {
  const start = parseClock(sendAfter);
  const end = parseClock(sendBefore);
  if (!start || !end) return due;
  const startMin = start.hours * 60 + start.minutes;
  const endMin = end.hours * 60 + end.minutes;
  if (startMin === endMin) return due;

  const next = new Date(due.getTime());
  const current = minutesOfDay(next);
  const inWindow = startMin < endMin ? current >= startMin && current < endMin : current >= startMin || current < endMin;
  if (inWindow) return next;

  next.setSeconds(0, 0);
  next.setHours(start.hours, start.minutes, 0, 0);
  if (startMin < endMin) {
    if (current >= endMin) next.setDate(next.getDate() + 1);
  } else if (current >= endMin && current < startMin) {
    // overnight window; wait until sendAfter today
  }
  return next;
}

export function nextResumeAt(
  now: number,
  waitSeconds: number,
  sendAfter?: string | null,
  sendBefore?: string | null,
): Date {
  const due = new Date(now + Math.max(0, waitSeconds) * 1000);
  return applySendWindow(due, sendAfter, sendBefore);
}

export type RandomizerPath = {
  id: string;
  percent: number;
  next?: string;
};

export function chooseRandomizerPath(paths: RandomizerPath[], roll: number): RandomizerPath | null {
  const usable = paths.filter((path) => (path.next ?? "").trim() && path.percent > 0);
  if (usable.length === 0) return paths.find((path) => (path.next ?? "").trim()) ?? null;
  const total = usable.reduce((sum, path) => sum + path.percent, 0);
  let cursor = (Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999) : 0) * total;
  for (const path of usable) {
    cursor -= path.percent;
    if (cursor < 0) return path;
  }
  return usable.at(-1) ?? null;
}
