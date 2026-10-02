import { describe, expect, it } from "vitest";
import { othersHere, touchPresence } from "@/lib/presence";

describe("live chat presence", () => {
  it("shows other teammates viewing or typing, and forgets them", () => {
    touchPresence("c-presence", "maya", false, 1_000);
    touchPresence("c-presence", "jordan", true, 2_000);
    expect(othersHere("c-presence", "maya", 3_000)).toEqual([{ agentId: "jordan", typing: true }]);
    expect(othersHere("c-presence", "jordan", 9_000)).toEqual([{ agentId: "maya", typing: false }]);
    expect(othersHere("c-presence", "maya", 9_000)).toEqual([{ agentId: "jordan", typing: false }]);
    expect(othersHere("c-presence", null, 20_000)).toEqual([]);
  });
});
