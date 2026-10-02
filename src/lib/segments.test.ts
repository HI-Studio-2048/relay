import { describe, expect, it } from "vitest";
import { describeCondition, matchesSegment, sanitizeSegment, type SegmentSubject } from "@/lib/segments";

const now = Date.parse("2026-10-01T12:00:00Z");
const ada: SegmentSubject = {
  tags: ["lead", "VIP"],
  email: "ada@example.com",
  phone: null,
  firstName: "Ada",
  customFields: { company: "Acme Corp", _cm: "x" },
  subscriptions: ["newsletter"],
  platform: "instagram",
  createdAt: "2026-09-28T12:00:00Z",
  lastInboundAt: "2026-10-01T02:00:00Z",
};

describe("segments", () => {
  it("matches everyone when empty", () => {
    expect(matchesSegment(ada, { match: "all", conditions: [] }, now)).toBe(true);
    expect(matchesSegment(ada, null, now)).toBe(true);
  });

  it("checks tags, fields, platform and lists case-insensitively", () => {
    const yes = (condition: Parameters<typeof describeCondition>[0]) => matchesSegment(ada, { match: "all", conditions: [condition] }, now);
    expect(yes({ kind: "tag", op: "has", value: "vip" })).toBe(true);
    expect(yes({ kind: "tag", op: "not", value: "lead" })).toBe(false);
    expect(yes({ kind: "field", key: "company", op: "contains", value: "acme" })).toBe(true);
    expect(yes({ kind: "field", key: "phone", op: "not_set" })).toBe(true);
    expect(yes({ kind: "field", key: "email", op: "eq", value: "ADA@example.com" })).toBe(true);
    expect(yes({ kind: "platform", op: "is", value: "Instagram" })).toBe(true);
    expect(yes({ kind: "platform", op: "not", value: "instagram" })).toBe(false);
    expect(yes({ kind: "list", op: "in", value: "Newsletter" })).toBe(true);
  });

  it("handles the 24-hour window and join dates", () => {
    const yes = (condition: Parameters<typeof describeCondition>[0]) => matchesSegment(ada, { match: "all", conditions: [condition] }, now);
    expect(yes({ kind: "active", op: "within", hours: 24 })).toBe(true);
    expect(yes({ kind: "active", op: "within", hours: 6 })).toBe(false);
    expect(yes({ kind: "active", op: "not_within", hours: 6 })).toBe(true);
    expect(yes({ kind: "joined", op: "within", days: 7 })).toBe(true);
    expect(matchesSegment({ ...ada, lastInboundAt: null }, { match: "all", conditions: [{ kind: "active", op: "within", hours: 24 }] }, now)).toBe(false);
  });

  it("supports any / all", () => {
    const conditions = [
      { kind: "tag" as const, op: "has" as const, value: "nope" },
      { kind: "platform" as const, op: "is" as const, value: "instagram" },
    ];
    expect(matchesSegment(ada, { match: "all", conditions }, now)).toBe(false);
    expect(matchesSegment(ada, { match: "any", conditions }, now)).toBe(true);
  });

  it("sanitizes untrusted input", () => {
    expect(
      sanitizeSegment({
        match: "any",
        conditions: [
          { kind: "tag", op: "has", value: " vip " },
          { kind: "tag", op: "has", value: "" },
          { kind: "bogus" },
          { kind: "active", op: "within", hours: "24" },
          { kind: "field", key: "email", op: "set" },
          null,
        ],
      }),
    ).toEqual({
      match: "any",
      conditions: [
        { kind: "tag", op: "has", value: "vip" },
        { kind: "active", op: "within", hours: 24 },
        { kind: "field", key: "email", op: "set" },
      ],
    });
    expect(sanitizeSegment("nope")).toEqual({ match: "all", conditions: [] });
  });

  it("describes conditions for humans", () => {
    expect(describeCondition({ kind: "active", op: "within", hours: 24 })).toBe("messaged in the last 24h");
    expect(describeCondition({ kind: "field", key: "company", op: "contains", value: "acme" })).toBe('company contains "acme"');
  });
});

describe("saved segments", () => {
  it("reads only valid saved segments", async () => {
    const { readSavedSegments } = await import("@/lib/segments");
    const saved = readSavedSegments({
      segments: [
        { id: "1", name: "VIPs", segment: { match: "all", conditions: [{ kind: "tag", op: "has", value: "vip" }] } },
        { id: "2", name: "Empty", segment: { match: "all", conditions: [] } },
        { name: "No id" },
        "junk",
      ],
    });
    expect(saved.map((item) => item.name)).toEqual(["VIPs"]);
    expect(readSavedSegments(null)).toEqual([]);
  });
});
