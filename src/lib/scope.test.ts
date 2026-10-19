import { describe, expect, it } from "vitest";
import { ALL_CHANNELS, applySelection, isAggregatePath, resolveScope } from "@/lib/scope";

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

describe("isAggregatePath", () => {
  it("lets only Overview and Live Chat merge channels", () => {
    expect(isAggregatePath("/")).toBe(true);
    expect(isAggregatePath("/inbox")).toBe(true);
    expect(isAggregatePath("/inbox/abc")).toBe(true);
    for (const path of ["/flows", "/flows/abc", "/broadcasts", "/broadcasts/new", "/contacts", "/inboxes"]) {
      expect(isAggregatePath(path)).toBe(false);
    }
  });
});

describe("applySelection", () => {
  // Writes the cookies the select route would, then resolves them the way server pages do.
  function pick(cookies: { view?: string; focus?: string }, choice: string, keepView: boolean) {
    const before = resolveScope(bots, cookies.view, cookies.focus);
    const next = applySelection(before, choice, keepView);
    const after = { view: next.view ?? cookies.view, focus: next.focus ?? cookies.focus };
    return { next, after: resolveScope(bots, after.view, after.focus) };
  }

  it("moves single-account pages without narrowing All channels", () => {
    const { next, after } = pick({}, "ig", true);
    expect(next).toEqual({ aggregate: true, focus: "ig" });
    expect(after).toEqual({ aggregate: true, bot: bots[1] });
  });

  it("follows the pick when Overview was already narrowed, so the old channel cannot win", () => {
    const { next, after } = pick({ view: "tg", focus: "tg" }, "ig", true);
    expect(next).toEqual({ aggregate: false, view: "ig", focus: "ig" });
    expect(after).toEqual({ aggregate: false, bot: bots[1] });
  });

  it("narrows to one channel when picked on Overview or Live Chat", () => {
    expect(pick({}, "ig", false).after).toEqual({ aggregate: false, bot: bots[1] });
  });

  it("goes back to All channels and keeps the account editor pages use", () => {
    const { next, after } = pick({ view: "ig", focus: "ig" }, ALL_CHANNELS, false);
    expect(next).toEqual({ aggregate: true, view: ALL_CHANNELS });
    expect(after).toEqual({ aggregate: true, bot: bots[1] });
  });

  it("always lands the resolved account on the account picked", () => {
    for (const view of [undefined, ALL_CHANNELS, "tg", "ig", "gone"]) {
      for (const keepView of [true, false]) {
        for (const choice of ["tg", "ig"]) {
          expect(pick({ view, focus: "tg" }, choice, keepView).after.bot?.id).toBe(choice);
        }
      }
    }
  });
});
