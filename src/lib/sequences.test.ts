import { describe, expect, it } from "vitest";
import { interpolateTemplate } from "@/lib/flow-effects";
import { remapSequenceIndex } from "@/lib/sequences";

describe("sequence personalization", () => {
  it("renders ManyChat-style variables in drip copy", () => {
    expect(
      interpolateTemplate("Hi {{name}} — {{email}}", {
        id: "c1",
        telegramUserId: "1",
        username: null,
        firstName: "Ada",
        lastName: null,
        email: "ada@histudio.test",
        phone: null,
        customFields: {},
        tags: [],
      }),
    ).toBe("Hi Ada — ada@histudio.test");
  });
});

describe("remapSequenceIndex", () => {
  const a = { delaySeconds: 0, body: "A" };
  const b = { delaySeconds: 60, body: "B" };
  const c = { delaySeconds: 60, body: "C" };
  const x = { delaySeconds: 60, body: "X" };
  it("keeps people on the same message when one is inserted before it", () => {
    expect(remapSequenceIndex([a, b, c], [a, x, b, c], 1)).toBe(2);
  });
  it("does not skip a message when an earlier one is deleted", () => {
    expect(remapSequenceIndex([a, b, c], [a, c], 2)).toBe(1);
  });
  it("continues after the last received step when the awaited one is gone or edited", () => {
    expect(remapSequenceIndex([a, b, c], [a, c], 1)).toBe(1);
    expect(remapSequenceIndex([a, b, c], [a, { ...b, body: "B2" }, c], 1)).toBe(1);
    expect(remapSequenceIndex([a, b], [a, b, c], 2)).toBe(2);
  });
  it("keeps people's place when several messages are reworded", () => {
    const edit = (step: typeof a) => ({ ...step, body: `${step.body}2` });
    expect(remapSequenceIndex([a, b, c], [edit(a), edit(b), edit(c)], 2)).toBe(2);
    expect(remapSequenceIndex([a, b, c], [a, edit(b), edit(c)], 2)).toBe(2);
    // A reorder is ambiguous; ties keep the later step, so nobody skips a message they never got.
    expect(remapSequenceIndex([a, b, c], [a, c, b], 1)).toBe(1);
    expect(remapSequenceIndex([a, b, c], [a, c, b], 2)).toBe(1);
  });
});
