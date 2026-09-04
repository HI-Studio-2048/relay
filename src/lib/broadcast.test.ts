import { describe, expect, it } from "vitest";
import {
  BroadcastConfirmError,
  CONFIRM_REQUIRED,
  assertConfirm,
  canDispatchBroadcast,
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

  it("assertConfirm throws a typed error for delete-style actions", () => {
    expect(() => assertConfirm(undefined, "Delete bot")).toThrow(BroadcastConfirmError);
    expect(() => assertConfirm(true, "Delete bot")).not.toThrow();
  });
});
