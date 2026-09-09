import { describe, expect, it } from "vitest";
import { interpolateTemplate } from "@/lib/flow-effects";
import type { ContactRecord } from "@/lib/types";

const contact: ContactRecord = {
  id: "c1",
  telegramUserId: "99",
  username: "ada",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@histudio.test",
  phone: "555",
  customFields: { company: "HI Studio" },
  tags: [],
};

describe("flow effect templates", () => {
  it("interpolates contact fields", () => {
    expect(interpolateTemplate("{{name}} {{email}} {{telegram_id}} {{field:company}}", contact)).toBe(
      "Ada Lovelace ada@histudio.test 99 HI Studio",
    );
  });
});
