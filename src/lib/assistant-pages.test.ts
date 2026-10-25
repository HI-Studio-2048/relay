import { describe, expect, it } from "vitest";
import { assistantHref, pageDescription } from "@/lib/assistant-pages";

describe("pages the assistant can open", () => {
  it("takes console pages and single records, nothing else", () => {
    expect(assistantHref("/flows")).toBe("/flows");
    expect(assistantHref(" /flows/abc-123 ")).toBe("/flows/abc-123");
    expect(assistantHref("/contacts/c_1")).toBe("/contacts/c_1");
    expect(assistantHref("https://evil.example")).toBeNull();
    expect(assistantHref("//evil.example")).toBeNull();
    expect(assistantHref("/api/agent")).toBeNull();
    expect(assistantHref("/flows/a/b")).toBeNull();
  });

  it("says in words what someone is looking at", () => {
    expect(pageDescription("/")).toBe("the Overview page (/)");
    expect(pageDescription("/flows")).toBe("the Flows page (/flows)");
    expect(pageDescription("/flows/f1")).toBe("a flow in the editor (/flows/f1)");
    expect(pageDescription("/inbox/c9")).toBe("the Inbox page (/inbox)");
    expect(pageDescription("/somewhere-else")).toBeNull();
  });
});
