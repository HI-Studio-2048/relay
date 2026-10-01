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

describe("interpolateTemplate", () => {
  const contact = {
    id: "c",
    telegramUserId: "42",
    username: "ada",
    firstName: "Ada",
    lastName: null,
    email: null,
    phone: null,
    customFields: { company: "Acme", _cm: "x" },
    tags: [],
  };

  it("supports ManyChat names, bare custom fields and fallbacks", () => {
    expect(interpolateTemplate("Hi {{first_name}} from {{company}}", contact)).toBe("Hi Ada from Acme");
    expect(interpolateTemplate("{{ last_name | friend }}!", contact)).toBe("friend!");
    expect(interpolateTemplate("{{field:company}} {{name}}", contact)).toBe("Acme Ada");
    expect(interpolateTemplate("{{unknown}} stays", contact)).toBe("{{unknown}} stays");
    expect(interpolateTemplate("{{unknown|ok}}", contact)).toBe("ok");
  });
});
