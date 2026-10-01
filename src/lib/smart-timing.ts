/**
 * Smart send time: deliver a broadcast to each person at the hour they usually message, within the
 * next 24 hours. Pure helpers; hours are UTC so they work for any viewer's time zone.
 */

/** The UTC hour someone writes most often, or null with too little history to tell. */
export function preferredHour(dates: Date[], minSamples = 2): number | null {
  if (dates.length < minSamples) return null;
  const counts = new Array<number>(24).fill(0);
  for (const date of dates) counts[date.getUTCHours()]! += 1;
  let best = 0;
  for (let hour = 1; hour < 24; hour += 1) if (counts[hour]! > counts[best]!) best = hour;
  return counts[best]! > 0 ? best : null;
}

/**
 * Instagram, Messenger and WhatsApp only allow messages within 24h of the person's last message, so a
 * smart send never waits past their last message + 23h (and goes now if that is already behind us).
 */
export function capToWindow(sendAt: Date, now: Date, lastInbound: Date | null): Date {
  if (!lastInbound) return sendAt;
  const cap = lastInbound.getTime() + 23 * 3_600_000;
  if (cap <= now.getTime()) return now;
  return sendAt.getTime() > cap ? now : sendAt;
}

/** The first moment at or after `start` that falls in `hour` (UTC); `start` itself when unknown. */
export function nextSendAt(start: Date, hour: number | null): Date {
  if (hour === null) return start;
  if (start.getUTCHours() === hour) return start;
  const at = new Date(start);
  at.setUTCMinutes(0, 0, 0);
  at.setUTCHours(hour);
  if (at.getTime() <= start.getTime()) at.setUTCDate(at.getUTCDate() + 1);
  return at;
}
