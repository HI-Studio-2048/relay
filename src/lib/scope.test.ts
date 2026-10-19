import { describe, expect, it } from "vitest";
import { ALL_CHANNELS, resolveScope } from "@/lib/scope";

const bots = [
  { id: "tg", name: "Shop" },
  { id: "ig", name: "Brand" },
];

describe("resolveScope", () => {
  it("defaults to every channel and keeps a concrete bot for editor pages", () => {
    expect(resolveScope(bots, undefined, undefined)).toEqual({ aggregate: true, bot: bots[0] });
    expect(resolveScope(bots, ALL_CHANNELS, "ig")).toEqual({ aggregate: true, bot: bots[1] });
  });

  it("keeps a chosen channel", () => {
    expect(resolveScope(bots, "ig", "tg")).toEqual({ aggregate: false, bot: bots[1] });
  });

  it("treats an unknown channel id as All channels", () => {
    expect(resolveScope(bots, "gone", "ig")).toEqual({ aggregate: true, bot: bots[1] });
  });

  it("is empty when the workspace has no channels", () => {
    expect(resolveScope([], "tg", "tg")).toEqual({ aggregate: false, bot: null });
  });
});
