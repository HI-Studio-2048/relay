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

  it("ignores the old single-channel cookie until the new switcher is used", () => {
    expect(resolveScope(bots, undefined, undefined, "ig")).toEqual({ aggregate: true, bot: bots[1] });
    expect(resolveScope(bots, undefined, "tg", "ig")).toEqual({ aggregate: true, bot: bots[0] });
  });

  it("keeps a channel only when the switcher cookie names it", () => {
    expect(resolveScope(bots, "ig", "tg", "tg")).toEqual({ aggregate: false, bot: bots[1] });
  });

  it("treats an unknown channel id as All channels", () => {
    expect(resolveScope(bots, "gone", "ig", "tg")).toEqual({ aggregate: true, bot: bots[1] });
  });

  it("is empty when the workspace has no channels", () => {
    expect(resolveScope([], "tg", "tg", "tg")).toEqual({ aggregate: false, bot: null });
  });
});
