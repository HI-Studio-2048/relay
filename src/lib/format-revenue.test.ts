import { describe, expect, it } from "vitest";
import { formatRevenue } from "@/lib/format";

describe("formatRevenue", () => {
  it("keeps currencies apart and biggest first", () => {
    expect(formatRevenue([{ currency: "jpy", value: 5000 }, { currency: "usd", value: 19.99 }, { currency: "USD", value: 5 }], "en-US")).toBe("¥5,000 · $24.99");
  });
  it("shows plain numbers when no currency is known, and nothing for zero", () => {
    expect(formatRevenue([{ currency: null, value: 49 }], "en-US")).toBe("49");
    expect(formatRevenue([{ currency: "usd", value: 0 }], "en-US")).toBe("");
  });
});
