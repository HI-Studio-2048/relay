import { describe, expect, it } from "vitest";
import { interpolateTemplate } from "@/lib/flow-effects";

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
