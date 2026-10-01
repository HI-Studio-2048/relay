import { describe, expect, it } from "vitest";
import { capToWindow, nextSendAt, preferredHour } from "@/lib/smart-timing";

const at = (iso: string) => new Date(iso);

describe("smart send time", () => {
  it("picks the most common UTC hour", () => {
    expect(preferredHour([at("2026-01-01T19:05:00Z"), at("2026-01-02T19:40:00Z"), at("2026-01-03T08:00:00Z")])).toBe(19);
    expect(preferredHour([at("2026-01-01T19:05:00Z")])).toBeNull();
  });

  it("schedules the next occurrence of that hour within a day", () => {
    const start = at("2026-10-01T15:30:00Z");
    expect(nextSendAt(start, 19).toISOString()).toBe("2026-10-01T19:00:00.000Z");
    expect(nextSendAt(start, 9).toISOString()).toBe("2026-10-02T09:00:00.000Z");
    expect(nextSendAt(start, 15)).toBe(start);
    expect(nextSendAt(start, null)).toBe(start);
  });

  it("never waits past the 24h messaging window", () => {
    const now = at("2026-10-01T15:30:00Z");
    const tonight = at("2026-10-01T19:00:00Z");
    expect(capToWindow(tonight, now, at("2026-10-01T10:00:00Z"))).toBe(tonight);
    expect(capToWindow(tonight, now, at("2026-09-30T19:05:00Z"))).toBe(now);
    expect(capToWindow(tonight, now, at("2026-09-29T19:05:00Z"))).toBe(now);
    expect(capToWindow(tonight, now, null)).toBe(tonight);
  });
});
