import { describe, expect, it } from "vitest";
import { filterThreads, initials, nextThreadId, relativeTime, type InboxThread } from "@/lib/inbox";
import { threadIsUnread } from "@/lib/store";

const thread = (id: string, extra: Partial<InboxThread> = {}): InboxThread => ({
  contactId: id,
  name: `Person ${id}`,
  username: null,
  status: "open",
  lastAt: "2026-09-09T10:00:00Z",
  lastBody: "hello",
  lastDirection: "inbound",
  unread: false,
  tags: [],
  ...extra,
});

describe("inbox list helpers", () => {
  const threads = [thread("a"), thread("b", { status: "closed", tags: ["vip"] }), thread("c", { lastBody: "pricing please" })];

  it("filters by tab and search across name, tag, and last message", () => {
    expect(filterThreads(threads, { tab: "open", query: "" }).map((t) => t.contactId)).toEqual(["a", "c"]);
    expect(filterThreads(threads, { tab: "closed", query: "" }).map((t) => t.contactId)).toEqual(["b"]);
    expect(filterThreads(threads, { tab: "all", query: "vip" }).map((t) => t.contactId)).toEqual(["b"]);
    expect(filterThreads(threads, { tab: "all", query: "PRICING" }).map((t) => t.contactId)).toEqual(["c"]);
  });

  it("steps through visible threads and wraps", () => {
    expect(nextThreadId(threads, "a", 1)).toBe("b");
    expect(nextThreadId(threads, "c", 1)).toBe("a");
    expect(nextThreadId(threads, "a", -1)).toBe("c");
    expect(nextThreadId(threads, null, 1)).toBe("a");
    expect(nextThreadId([threads[0]!], "a", 1)).toBeNull();
    expect(nextThreadId([], "a", 1)).toBeNull();
  });

  it("marks a thread unread only for inbound messages newer than the last read", () => {
    const at = new Date("2026-09-09T10:00:00Z");
    expect(threadIsUnread("inbound", at, null)).toBe(true);
    expect(threadIsUnread("inbound", at, new Date("2026-09-09T09:00:00Z"))).toBe(true);
    expect(threadIsUnread("inbound", at, new Date("2026-09-09T11:00:00Z"))).toBe(false);
    expect(threadIsUnread("outbound", at, null)).toBe(false);
  });

  it("formats initials and relative times", () => {
    expect(initials("Daniel Philip")).toBe("DP");
    expect(initials("@dana")).toBe("D");
    const now = Date.parse("2026-09-09T12:00:00Z");
    expect(relativeTime("2026-09-09T11:59:40Z", now)).toBe("now");
    expect(relativeTime("2026-09-09T11:30:00Z", now)).toBe("30m");
    expect(relativeTime("2026-09-09T09:00:00Z", now)).toBe("3h");
    expect(relativeTime("2026-09-07T09:00:00Z", now)).toBe("2d");
  });
});
