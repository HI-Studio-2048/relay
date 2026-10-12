import { describe, expect, it } from "vitest";
import { buildBlueskyMessage, eventsFromLog, explainBlueskyError, linkFacets, parseBlueskyEvent } from "@/lib/channels/bluesky";
import type { OutboundReply } from "@/lib/types";

const reply = (over: Partial<OutboundReply>): OutboundReply => ({ text: "", source: "flow", ...over });

describe("Bluesky messages", () => {
  it("sends plain text", () => {
    expect(buildBlueskyMessage(reply({ text: "Hi there" }))).toEqual({ text: "Hi there" });
  });

  it("lists buttons as numbers and quick replies as bullets", () => {
    const body = buildBlueskyMessage(
      reply({ text: "Pick one", buttons: [{ text: "Pricing", data: "n:1" }, { text: "Docs", url: "https://example.com/docs" }, { text: "Talk to us", data: "n:2" }], keyboard: ["Small"] }),
    );
    expect(body.text).toBe("Pick one\n1. Pricing\nDocs: https://example.com/docs\n3. Talk to us\n• Small");
  });

  it("keeps button numbers lined up across a split message", () => {
    const body = buildBlueskyMessage(reply({ text: "More", buttons: [{ text: "Four", data: "n:4" }], buttonNumberOffset: 3 }));
    expect(body.text).toBe("More\n4. Four");
  });

  it("makes links tappable with byte offsets, even after multibyte text", () => {
    const text = "héllo 👋 https://example.com/a?b=1.";
    const [facet] = linkFacets(text);
    const bytes = new TextEncoder().encode(text);
    const linked = new TextDecoder().decode(bytes.slice(facet!.index.byteStart, facet!.index.byteEnd));
    expect(linked).toBe("https://example.com/a?b=1");
    expect(facet!.features[0]).toEqual({ $type: "app.bsky.richtext.facet#link", uri: "https://example.com/a?b=1" });
  });

  it("adds no facets when there is no link", () => {
    expect(buildBlueskyMessage(reply({ text: "plain" })).facets).toBeUndefined();
  });

  it("clips to 1000 characters", () => {
    const body = buildBlueskyMessage(reply({ text: "a".repeat(1500) }));
    expect(Array.from(body.text)).toHaveLength(1000);
    expect(body.text.endsWith("…")).toBe(true);
  });

  it("never sends an empty message", () => {
    expect(buildBlueskyMessage(reply({ text: "" })).text).toBeTruthy();
  });
});

describe("Bluesky inbound", () => {
  const created = (over: Record<string, unknown> = {}, convoId = "c1") => ({
    $type: "chat.bsky.convo.defs#logCreateMessage",
    convoId,
    message: { $type: "chat.bsky.convo.defs#messageView", id: "m1", text: " hello ", sender: { did: "did:plc:them" }, ...over },
  });

  it("reads a new message from someone else", () => {
    expect(eventsFromLog([created()], "did:plc:me")).toEqual([{ did: "did:plc:them", convoId: "c1", messageId: "m1", text: "hello", sentAt: undefined }]);
  });

  it("skips the account's own messages, other log types and deleted messages", () => {
    const own = created({ sender: { did: "did:plc:me" } });
    const read = { $type: "chat.bsky.convo.defs#logReadMessage", convoId: "c1", message: {} };
    const deleted = created({ $type: "chat.bsky.convo.defs#deletedMessageView" });
    expect(eventsFromLog([own, read, deleted], "did:plc:me")).toEqual([]);
  });

  it("marks an embed with no text as an attachment and drops an empty message", () => {
    expect(eventsFromLog([created({ text: "", embed: { record: {} } })], "did:plc:me")[0]?.text).toBe("[attachment]");
    expect(eventsFromLog([created({ text: " " })], "did:plc:me")).toEqual([]);
  });

  it("turns an event into a contact message", () => {
    expect(parseBlueskyEvent({ did: "did:plc:them", convoId: "c1", messageId: "m1", text: "hi" })).toEqual([
      { externalUserId: "did:plc:them", text: "hi", externalMessageId: "m1" },
    ]);
    expect(parseBlueskyEvent({ did: "", convoId: "c1", messageId: "m1", text: "hi" })).toEqual([]);
  });
});

describe("Bluesky errors", () => {
  it("explains a missing direct message permission", () => {
    expect(explainBlueskyError(new Error("Bluesky: Bad token scope"))).toMatch(/Allow access to your direct messages/);
  });

  it("passes other errors through", () => {
    expect(explainBlueskyError(new Error("Bluesky: Invalid identifier or password"))).toBe("Bluesky: Invalid identifier or password");
  });
});
