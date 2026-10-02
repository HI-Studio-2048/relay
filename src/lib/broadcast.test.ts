import { describe, expect, it } from "vitest";
import {
  BroadcastConfirmError,
  CONFIRM_REQUIRED,
  assertConfirm,
  canDispatchBroadcast,
  isBroadcastable,
  nextBroadcastStatusAfterConfirm,
} from "@/lib/broadcast";

describe("confirm-before-broadcast", () => {
  it("refuses send when confirm is missing, false, or a string", () => {
    for (const confirm of [undefined, false, "true", 1, { confirm: true }]) {
      const result = canDispatchBroadcast({ status: "draft", confirm });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(CONFIRM_REQUIRED);
      }
    }
  });

  it("allows send only after explicit confirm: true on a draft", () => {
    const result = canDispatchBroadcast({ status: "draft", confirm: true });
    expect(result).toEqual({ ok: true });
    expect(nextBroadcastStatusAfterConfirm()).toBe("queued");
  });

  it("does not send an already-queued or sent broadcast even with confirm", () => {
    expect(canDispatchBroadcast({ status: "queued", confirm: true }).ok).toBe(false);
    expect(canDispatchBroadcast({ status: "sending", confirm: true }).ok).toBe(false);
    expect(canDispatchBroadcast({ status: "sent", confirm: true }).ok).toBe(false);
  });

  it("skips globally unsubscribed contacts", () => {
    expect(isBroadcastable({})).toBe(true);
    expect(isBroadcastable({ unsubscribed: false })).toBe(true);
    expect(isBroadcastable({ unsubscribed: true })).toBe(false);
  });

  it("assertConfirm throws a typed error for delete-style actions", () => {
    expect(() => assertConfirm(undefined, "Delete bot")).toThrow(BroadcastConfirmError);
    expect(() => assertConfirm(true, "Delete bot")).not.toThrow();
  });
});

describe("broadcast A/B split", () => {
  it("splits evenly and shuffles", async () => {
    const { splitArms } = await import("@/lib/broadcast-dispatch");
    const arms = splitArms(11, () => 0.3);
    expect(arms.filter((arm) => arm === "a")).toHaveLength(6);
    expect(arms.filter((arm) => arm === "b")).toHaveLength(5);
    expect(splitArms(0)).toEqual([]);
  });
});
