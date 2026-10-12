import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSlackMessage, fetchSlackIdentity, parseSlackEvent, sendSlackReply, verifySlackSignature } from "@/lib/channels/slack";
import type { ChannelAccount } from "@/lib/channels/types";
import type { OutboundReply } from "@/lib/types";

const reply = (over: Partial<OutboundReply>): OutboundReply => ({ text: "", source: "flow", ...over });

const account: ChannelAccount = {
  id: "bot1",
  channel: "slack",
  token: "xoxb-test",
  externalAccountId: "UBOT",
  handle: "recatch",
  appSecret: "signing-secret",
  verifyToken: "unused",
};

afterEach(() => vi.unstubAllGlobals());

describe("Slack signatures", () => {
  const body = '{"type":"event_callback"}';
  const now = 1_700_000_000_000;
  const sign = (secret: string, ts: string, text: string) => `v0=${createHmac("sha256", secret).update(`v0:${ts}:${text}`).digest("hex")}`;

  it("accepts a correctly signed request", () => {
    const ts = String(now / 1000);
    expect(verifySlackSignature("signing-secret", body, ts, sign("signing-secret", ts, body), now)).toBe(true);
  });

  it("rejects a wrong secret, a changed body and a missing header", () => {
    const ts = String(now / 1000);
    expect(verifySlackSignature("signing-secret", body, ts, sign("other", ts, body), now)).toBe(false);
    expect(verifySlackSignature("signing-secret", body + " ", ts, sign("signing-secret", ts, body), now)).toBe(false);
    expect(verifySlackSignature("signing-secret", body, ts, null, now)).toBe(false);
    expect(verifySlackSignature("signing-secret", body, null, "v0=abc", now)).toBe(false);
  });

  it("rejects a replayed request older than five minutes", () => {
    const ts = String(now / 1000 - 301);
    expect(verifySlackSignature("signing-secret", body, ts, sign("signing-secret", ts, body), now)).toBe(false);
  });

  it("does not throw on a malformed signature", () => {
    const ts = String(now / 1000);
    expect(verifySlackSignature("signing-secret", body, ts, "v0=not-hex", now)).toBe(false);
  });
});

describe("Slack messages", () => {
  it("sends plain text with no blocks", () => {
    expect(buildSlackMessage(reply({ text: "Hi there" }))).toEqual({ text: "Hi there", mrkdwn: false });
  });

  it("turns buttons into link and callback buttons", () => {
    const body = buildSlackMessage(
      reply({ text: "Pick one", buttons: [{ text: "Pricing", url: "https://example.com/pricing" }, { text: "Talk to us", data: "n:abc" }] }),
    );
    expect(body.blocks?.[0]).toMatchObject({ type: "section", text: { type: "plain_text", text: "Pick one" } });
    expect(body.blocks?.[1]).toMatchObject({
      type: "actions",
      elements: [
        { type: "button", action_id: "b0", url: "https://example.com/pricing" },
        { type: "button", action_id: "b1", value: "n:abc" },
      ],
    });
  });

  it("makes quick replies buttons that carry their title", () => {
    const body = buildSlackMessage(reply({ text: "Size?", keyboard: ["Small", "Large"] }));
    const values = (body.blocks?.[1] as { elements: { value: string }[] }).elements.map((e) => e.value);
    expect(values).toEqual(["qr:Small", "qr:Large"]);
  });

  it("puts five buttons in a row and stops at 25", () => {
    const buttons = Array.from({ length: 40 }, (_, i) => ({ text: `B${i}`, data: `n:${i}` }));
    const body = buildSlackMessage(reply({ text: "Many", buttons }));
    const rows = body.blocks!.filter((block) => block.type === "actions") as { elements: unknown[] }[];
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.elements.length === 5)).toBe(true);
  });

  it("gives every action id in a message a different value", () => {
    const body = buildSlackMessage(reply({ text: "Pick", buttons: [{ text: "A", data: "n:1" }], keyboard: ["B"] }));
    const ids = body.blocks!.flatMap((block) => ((block.elements as { action_id: string }[] | undefined) ?? []).map((e) => e.action_id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("clips long text and button labels", () => {
    expect(buildSlackMessage(reply({ text: "a".repeat(4000) })).text).toHaveLength(3000);
    const body = buildSlackMessage(reply({ text: "x", buttons: [{ text: "b".repeat(200), data: "n:1" }] }));
    const label = ((body.blocks![1] as { elements: { text: { text: string } }[] }).elements[0]!).text.text;
    expect(label).toHaveLength(75);
  });

  it("never sends an empty message", () => {
    expect(buildSlackMessage(reply({ text: "" })).text).toBeTruthy();
    expect(buildSlackMessage(reply({ text: "", buttons: [{ text: "Go", data: "n:1" }] })).text).toBe("Choose an option");
  });

  it("attaches an image as its own block", () => {
    const body = buildSlackMessage(reply({ text: "Look", media: { url: "https://cdn.example.com/a.png", kind: "photo" } }));
    expect(body.blocks?.[1]).toMatchObject({ type: "image", image_url: "https://cdn.example.com/a.png" });
  });
});

describe("Slack inbound", () => {
  const message = (event: Record<string, unknown>) => ({ type: "event_callback", event_id: "Ev1", event: { type: "message", channel_type: "im", ...event } });

  it("reads a direct message", () => {
    expect(parseSlackEvent(message({ user: "U1", text: " hello ", ts: "1.2" }))).toEqual([
      { externalUserId: "U1", text: "hello", externalMessageId: "1.2" },
    ]);
  });

  it("marks a file with no caption as an attachment", () => {
    const [event] = parseSlackEvent(message({ user: "U1", text: "", subtype: "file_share", files: [{}] }));
    expect(event?.text).toBe("[attachment]");
  });

  it("ignores channel chatter, bot messages and edits", () => {
    expect(parseSlackEvent(message({ user: "U1", text: "hi", channel_type: "channel" }))).toEqual([]);
    expect(parseSlackEvent(message({ user: "U1", text: "hi", bot_id: "B1" }))).toEqual([]);
    expect(parseSlackEvent(message({ user: "U1", subtype: "message_changed" }))).toEqual([]);
    expect(parseSlackEvent(message({ text: "no user" }))).toEqual([]);
  });

  it("reads a flow button tap as callback data", () => {
    const tap = { type: "block_actions", trigger_id: "t1", user: { id: "U1", username: "sam" }, actions: [{ action_id: "b0", value: "n:abc", text: { text: "Pricing" } }] };
    expect(parseSlackEvent(tap)).toEqual([
      { externalUserId: "U1", username: "sam", text: null, callbackData: "n:abc", callbackTitle: "Pricing", externalMessageId: "t1" },
    ]);
  });

  it("reads a quick reply tap as text", () => {
    const tap = { type: "block_actions", user: { id: "U1" }, actions: [{ action_id: "b0", value: "qr:Small" }] };
    expect(parseSlackEvent(tap)[0]).toMatchObject({ text: "Small", callbackData: null });
  });

  it("ignores a link button click, which carries no value", () => {
    expect(parseSlackEvent({ type: "block_actions", user: { id: "U1" }, actions: [{ action_id: "b0" }] })).toEqual([]);
  });

  it("ignores the URL check and unknown types", () => {
    expect(parseSlackEvent({ type: "url_verification", challenge: "x" })).toEqual([]);
    expect(parseSlackEvent({})).toEqual([]);
  });
});

describe("Slack API calls", () => {
  const stub = (responses: { status?: number; body: unknown; headers?: Record<string, string> }[]) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const queue = [...responses];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const next = queue.shift()!;
        return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: next.headers });
      }),
    );
    return calls;
  };

  it("posts a reply to the user's id and returns the timestamp as the message id", async () => {
    const calls = stub([{ body: { ok: true, ts: "1700.0001" } }]);
    const sent = await sendSlackReply(account, "U1", reply({ text: "Hello" }));
    expect(sent).toEqual({ message_id: "1700.0001" });
    expect(calls[0]!.url).toBe("https://slack.com/api/chat.postMessage");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer xoxb-test");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ channel: "U1", text: "Hello" });
  });

  it("turns an ok:false answer into an error with Slack's reason", async () => {
    stub([{ body: { ok: false, error: "invalid_auth" } }]);
    await expect(fetchSlackIdentity("bad")).rejects.toThrow("Slack: invalid_auth");
  });

  it("waits out one rate limit and retries", async () => {
    vi.useFakeTimers();
    const calls = stub([{ status: 429, body: {}, headers: { "retry-after": "1" } }, { body: { ok: true, ts: "1.1" } }]);
    const pending = sendSlackReply(account, "U1", reply({ text: "Hi" }));
    await vi.advanceTimersByTimeAsync(1100);
    await expect(pending).resolves.toEqual({ message_id: "1.1" });
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
  });
});
