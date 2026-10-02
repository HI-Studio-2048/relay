import { describe, expect, it } from "vitest";
import { matchFlowTrigger, type FlowRecord } from "@/lib/flow-engine";
import { intentFlows, routeToIntent, shouldCheckIntents } from "@/lib/intents";

const flow = (id: string, triggerType: FlowRecord["triggerType"], triggerValue: string | null, isActive = true): FlowRecord => ({
  id,
  triggerType,
  triggerValue,
  isActive,
  definition: { startStepId: "a", steps: [{ id: "a", type: "end", text: id }] },
});

const flows = [
  flow("price", "keyword_contains", "price"),
  flow("ship", "intent", "Asking about shipping or delivery times"),
  flow("off", "intent", "Wants a refund", false),
  flow("fallback", "default", null),
];

describe("AI intents", () => {
  it("only lists active intents with a description", () => {
    expect(intentFlows([...flows, flow("blank", "intent", "  ")]).map((item) => item.id)).toEqual(["ship"]);
  });

  it("checks intents only when nothing more specific than the default reply matched", () => {
    expect(shouldCheckIntents({ flows, session: null, text: "when will my order arrive?" })).toBe(true);
    expect(shouldCheckIntents({ flows, session: null, text: "what's the price?" })).toBe(false);
    expect(shouldCheckIntents({ flows, session: null, text: "/start" })).toBe(false);
    expect(shouldCheckIntents({ flows, session: null, text: "hi", callbackData: "n:x" })).toBe(false);
    expect(
      shouldCheckIntents({
        flows,
        session: { id: "s", contactId: "c", flowId: "price", stepId: "a", awaitingInput: true, status: "active" },
        text: "my email is a@b.co",
      }),
    ).toBe(false);
    expect(shouldCheckIntents({ flows: flows.filter((item) => item.triggerType !== "intent"), session: null, text: "where is it" })).toBe(false);
  });

  it("routes the message to the chosen intent ahead of the default reply", () => {
    expect(matchFlowTrigger(routeToIntent(flows, "ship"), "when will it arrive")?.id).toBe("ship");
    expect(matchFlowTrigger(routeToIntent(flows, "missing"), "when will it arrive")?.id).toBe("fallback");
    // A keyword still wins over the routed intent.
    expect(matchFlowTrigger(routeToIntent(flows, "ship"), "price please")?.id).toBe("price");
  });
});

describe("AI public comment replies", () => {
  it("rejects links, mentions and hashtags", async () => {
    const { safePublicReply } = await import("@/lib/ai");
    expect(safePublicReply("  Thanks Rae!  Check your DMs 💌 ")).toBe("Thanks Rae! Check your DMs 💌");
    for (const bad of ["Visit evil.com now", "go to https://x.y", "ping @someone", "#ad free stuff", "www.spam.io"]) {
      expect(() => safePublicReply(bad), bad).toThrow();
    }
  });
});
