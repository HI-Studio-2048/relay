import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildZernioMessages,
  parseZernioWebhook,
  verifyZernioSignature,
  zernioContactKey,
} from "@/lib/channels/zernio";
import { processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { matchSocialFlow, pickPublicReply } from "@/lib/social-triggers";
import type { FlowDefinition } from "@/lib/types";

const account = { id: "acc_ig", accountId: "acc_ig", platform: "instagram", username: "studio" };

describe("Zernio webhook parsing", () => {
  it("normalizes an incoming DM with routing", () => {
    const [event] = parseZernioWebhook({
      event: "message.received",
      message: {
        id: "m1",
        conversationId: "conv_1",
        platform: "instagram",
        platformMessageId: "pm1",
        direction: "incoming",
        text: "hello",
        attachments: [],
        sender: { id: "ig_user", name: "Ada Lovelace", username: "ada", picture: "https://cdn/x.jpg" },
      },
      account,
      metadata: null,
    });
    expect(event).toMatchObject({
      externalUserId: zernioContactKey("acc_ig", "ig_user"),
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      text: "hello",
      kind: "message",
      platform: "instagram",
      channelAccountId: "acc_ig",
      threadId: "conv_1",
      avatarUrl: "https://cdn/x.jpg",
    });
  });

  it("turns button payloads back into engine callbacks and quick replies into text", () => {
    const base = {
      event: "message.received",
      message: { conversationId: "c", direction: "incoming" as const, text: "Yes", sender: { id: "u" }, attachments: [] },
      account,
    };
    expect(parseZernioWebhook({ ...base, metadata: { postbackPayload: "n:step2" } })[0]).toMatchObject({
      callbackData: "n:step2",
      text: null,
    });
    expect(parseZernioWebhook({ ...base, metadata: { quickReplyPayload: "qr:Pricing" } })[0]?.text).toBe("Pricing");
  });

  it("drops outgoing echoes and accounts outside the filter", () => {
    const echo = {
      event: "message.received",
      message: { direction: "outgoing" as const, text: "x", sender: { id: "biz" }, attachments: [] },
      account,
    };
    expect(parseZernioWebhook(echo)).toEqual([]);
    const inbound = { ...echo, message: { ...echo.message, direction: "incoming" as const } };
    expect(parseZernioWebhook(inbound, "acc_other")).toEqual([]);
    expect(parseZernioWebhook(inbound, "acc_other, acc_ig")).toHaveLength(1);
  });

  it("flags story replies and story mentions", () => {
    const base = {
      event: "message.received",
      message: { conversationId: "c", direction: "incoming" as const, text: "🔥", sender: { id: "u" }, attachments: [] },
      account,
    };
    expect(parseZernioWebhook({ ...base, metadata: { storyReply: { storyId: "s1" } } })[0]?.kind).toBe("story_reply");
    expect(
      parseZernioWebhook({
        ...base,
        message: { ...base.message, text: null, attachments: [{ type: "share", originalType: "story_mention", url: "u" }] },
      })[0]?.kind,
    ).toBe("story_mention");
  });

  it("normalizes comments and ignores the account's own comments", () => {
    const payload = {
      event: "comment.received",
      comment: {
        id: "cm1",
        postId: "post_z",
        platformPostId: "1789",
        platform: "instagram",
        text: "Send me the GUIDE please",
        author: { id: "ig_user", username: "ada", name: "Ada" },
        isReply: false,
        parentCommentId: null,
      },
      post: { id: "post_z", platformPostId: "1789", content: "Free guide", permalink: "https://instagram.com/p/abc" },
      account,
    };
    const [event] = parseZernioWebhook(payload);
    expect(event).toMatchObject({
      kind: "comment",
      text: "Send me the GUIDE please",
      threadId: null,
      comment: { id: "cm1", postId: "post_z", platformPostId: "1789", permalink: "https://instagram.com/p/abc" },
    });
    expect(parseZernioWebhook({ ...payload, comment: { ...payload.comment, author: { id: "me", isOwnAccount: true } } })).toEqual([]);
  });

  it("opens growth-link refs like /start", () => {
    const [event] = parseZernioWebhook({
      event: "message.received",
      message: { conversationId: "c", direction: "incoming", text: null, sender: { id: "u" }, attachments: [] },
      account,
      metadata: { referral: { ref: "promo" } },
    });
    expect(event?.text).toBe("/start promo");
  });
});

describe("Zernio signatures", () => {
  it("accepts the hex HMAC of the raw body and rejects anything else", () => {
    const body = JSON.stringify({ event: "message.received" });
    const signature = createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(verifyZernioSignature("s3cret", body, signature)).toBe(true);
    expect(verifyZernioSignature("s3cret", body, `sha256=${signature}`)).toBe(true);
    expect(verifyZernioSignature("s3cret", `${body} `, signature)).toBe(false);
    expect(verifyZernioSignature("s3cret", body, null)).toBe(false);
    expect(verifyZernioSignature("s3cret", body, "zz")).toBe(false);
  });
});

describe("Zernio message bodies", () => {
  it("maps buttons to postbacks and URL buttons on Instagram", () => {
    const [body] = buildZernioMessages(
      {
        text: "Pick one",
        buttons: [
          { text: "Pricing", data: "n:p" },
          { text: "Site", url: "https://example.com" },
        ],
        source: "flow",
      },
      "instagram",
    );
    expect(body).toEqual({
      message: "Pick one",
      buttons: [
        { type: "postback", title: "Pricing", payload: "n:p" },
        { type: "url", title: "Site", url: "https://example.com" },
      ],
    });
  });

  it("falls back to numbered text where buttons are not supported", () => {
    const [body] = buildZernioMessages(
      { text: "Pick", buttons: [{ text: "A", data: "n:a" }], keyboard: undefined, source: "flow" },
      "tiktok",
    );
    expect(body).toEqual({ message: "Pick\n1. A" });
  });

  it("sends quick replies with a qr: payload", () => {
    const [body] = buildZernioMessages({ text: "Size?", keyboard: ["S", "M"], source: "flow" }, "facebook");
    expect(body?.quickReplies).toEqual([
      { title: "S", payload: "qr:S" },
      { title: "M", payload: "qr:M" },
    ]);
  });
});

const commentFlow = (id: string, triggerValue: string | null, trigger: FlowDefinition["trigger"]): FlowRecord => ({
  id,
  triggerType: "comment",
  triggerValue,
  isActive: true,
  definition: {
    startStepId: "s1",
    trigger,
    steps: [
      { id: "s1", type: "text", text: "Here you go {{first_name}}", buttons: [{ text: "Get it", next: "s2" }], next: undefined },
      { id: "s2", type: "end", text: "Link: https://x" },
    ],
  },
});

describe("comment automations", () => {
  const anyPost = commentFlow("any", "guide", { publicReplies: ["Check your DMs!"] });
  const specific = commentFlow("specific", "", { postIds: ["post_z"] });

  it("prefers a post-specific flow and honors keywords", () => {
    expect(matchSocialFlow([anyPost, specific], { kind: "comment", text: "hi", postId: "post_z" })?.id).toBe("specific");
    expect(matchSocialFlow([anyPost, specific], { kind: "comment", text: "GUIDE pls", postId: "other" })?.id).toBe("any");
    expect(matchSocialFlow([anyPost, specific], { kind: "comment", text: "nice pic", postId: "other" })).toBeNull();
  });

  it("matches posts by permalink prefix", () => {
    const byLink = commentFlow("link", "", { postIds: ["https://instagram.com/p/abc/"] });
    expect(
      matchSocialFlow([byLink], { kind: "comment", text: "x", postId: "p", permalink: "https://instagram.com/p/abc/?igsh=1" })?.id,
    ).toBe("link");
  });

  it("runs the flow once per person per post and returns a public reply", () => {
    const event = {
      telegramUserId: "acc:u",
      firstName: "Ada",
      text: "guide",
      kind: "comment" as const,
      postId: "p1",
    };
    const first = processInboundEvent({ contact: null, session: null, flows: [anyPost], event });
    expect(first.replies[0]?.text).toBe("Here you go {{first_name}}");
    expect(first.publicReply).toBe("Check your DMs!");
    expect(first.privateReply).toBe(true);
    expect(first.session?.stepId).toBe("s1");

    const again = processInboundEvent({ contact: first.contact, session: null, flows: [anyPost], event });
    expect(again.replies).toEqual([]);

    const otherPost = processInboundEvent({ contact: first.contact, session: null, flows: [anyPost], event: { ...event, postId: "p2" } });
    expect(otherPost.replies).toHaveLength(1);
  });

  it("never answers an unmatched comment with the default reply", () => {
    const fallback: FlowRecord = { ...commentFlow("d", null, undefined), triggerType: "default" };
    const result = processInboundEvent({
      contact: null,
      session: null,
      flows: [fallback],
      event: { telegramUserId: "u", text: "lol", kind: "comment", postId: "p" },
    });
    expect(result.replies).toEqual([]);
    expect(result.inboundSaved).toBe(true);
  });

  it("lets an unmatched story reply fall through to keywords", () => {
    const keyword: FlowRecord = { ...commentFlow("k", "price", undefined), triggerType: "keyword_contains" };
    const result = processInboundEvent({
      contact: null,
      session: null,
      flows: [keyword],
      event: { telegramUserId: "u", text: "what's the price", kind: "story_reply" },
    });
    expect(result.replies).toHaveLength(1);
  });

  it("picks public replies at random", () => {
    expect(pickPublicReply({ publicReplies: ["a", "b", " "] }, 0)).toBe("a");
    expect(pickPublicReply({ publicReplies: ["a", "b"] }, 0.99)).toBe("b");
    expect(pickPublicReply({ publicReplies: [] })).toBeNull();
  });
});

describe("review fixes", () => {
  const buttonsFlow: FlowRecord = {
    id: "b",
    triggerType: "keyword",
    triggerValue: "menu",
    isActive: true,
    definition: {
      startStepId: "m",
      steps: [
        { id: "m", type: "text", text: "Pick", buttons: [{ text: "Pricing", next: "p" }, { text: "Site", url: "https://x" }, { text: "Human", next: "h" }] },
        { id: "p", type: "end", text: "Plans start at $49" },
        { id: "h", type: "end", text: "Connecting you" },
      ],
    },
  };

  it("maps a typed number or label to the button on the parked step", () => {
    const first = processInboundEvent({ contact: null, session: null, flows: [buttonsFlow], event: { telegramUserId: "u", text: "menu" } });
    const byNumber = processInboundEvent({ contact: first.contact, session: first.session, flows: [buttonsFlow], event: { telegramUserId: "u", text: "3" } });
    expect(byNumber.replies[0]?.text).toBe("Connecting you");
    expect(byNumber.clicked).toEqual({ flowId: "b", stepId: "m" });
    const byLabel = processInboundEvent({ contact: first.contact, session: first.session, flows: [buttonsFlow], event: { telegramUserId: "u", text: "pricing" } });
    expect(byLabel.replies[0]?.text).toBe("Plans start at $49");
    const urlButton = processInboundEvent({ contact: first.contact, session: first.session, flows: [buttonsFlow], event: { telegramUserId: "u", text: "2" } });
    expect(urlButton.clicked).toBeUndefined();
  });

  it("numbers overflow buttons by their position in the full list", () => {
    const [body] = buildZernioMessages(
      { text: "Pick", buttons: [1, 2, 3, 4].map((n) => ({ text: `B${n}`, data: `n:${n}` })), source: "flow" },
      "instagram",
    );
    expect(body?.message).toBe("Pick\n4. B4");
  });

  it("does not let a comment replace a paused or mid-question session", () => {
    const flow = commentFlow("c", "", {});
    const session = { id: "s", contactId: "c", flowId: "other", stepId: "x", awaitingInput: true, status: "active" as const };
    const result = processInboundEvent({ contact: null, session, flows: [flow], event: { telegramUserId: "u", text: "hi", kind: "comment", postId: "p" } });
    expect(result.replies).toEqual([]);
    expect(result.session).toBe(session);
  });

  it("keeps once-per-post markers in one capped field", () => {
    const flow = commentFlow("c", "", {});
    let contact = null as ReturnType<typeof processInboundEvent>["contact"] | null;
    for (let i = 0; i < 205; i += 1) {
      contact = processInboundEvent({ contact, session: null, flows: [flow], event: { telegramUserId: "u", text: "hi", kind: "comment", postId: `p${i}` } }).contact;
    }
    const keys = Object.keys(contact!.customFields).filter((key) => key.startsWith("_"));
    expect(keys).toEqual(["_cm"]);
    expect(JSON.parse(contact!.customFields._cm!)).toHaveLength(200);
  });
});

describe("Instagram follower facts", () => {
  it("become contact fields on DMs and comments", async () => {
    const { instagramProfileFields } = await import("@/lib/channels/zernio");
    expect(instagramProfileFields({ isFollower: false, followerCount: 1200, isVerified: null })).toEqual({ follows_you: "no", ig_followers: "1200" });
    expect(instagramProfileFields(undefined)).toBeUndefined();
    const [event] = parseZernioWebhook({
      event: "message.received",
      message: { conversationId: "c", direction: "incoming", text: "x", sender: { id: "u", instagramProfile: { isFollower: true, isVerified: true } }, attachments: [] },
      account,
    });
    expect(event?.profileFields).toEqual({ follows_you: "yes", ig_verified: "yes" });
  });

  it("gates the follow-to-unlock template on follows_you", async () => {
    const { FLOW_TEMPLATES } = await import("@/lib/flow-templates");
    const template = FLOW_TEMPLATES.find((item) => item.id === "follow-gate")!;
    const flow = { id: "fg", triggerType: template.triggerType, triggerValue: template.triggerValue, isActive: true, definition: template.definition };
    const base = { id: "c", telegramUserId: "u", username: null, firstName: "Ada", lastName: null, email: null, phone: null, customFields: {}, tags: [] };
    const session = { id: "s", contactId: "c", flowId: "fg", stepId: "open", awaitingInput: false, status: "active" as const };
    const notYet = processInboundEvent({ contact: { ...base, customFields: { follows_you: "no" } }, session, flows: [flow], event: { telegramUserId: "u", callbackData: "n:check" } });
    expect(notYet.replies[0]?.text).toContain("Follow us first");
    const followed = processInboundEvent({ contact: { ...base, customFields: { follows_you: "yes" } }, session: notYet.session, flows: [flow], event: { telegramUserId: "u", callbackData: "n:check" } });
    expect(followed.replies[0]?.text).toContain("Unlocked");
    expect(followed.contact.tags).toContain("follower-unlocked");
  });
});

describe("comment moderation", () => {
  it("hides on whole words and links only when enabled", async () => {
    const { moderationReason, readModeration } = await import("@/lib/social-triggers");
    const moderation = readModeration({ moderation: { enabled: true, words: ["Scam", " spam "], hideLinks: true } });
    expect(moderationReason(moderation, "this is a SCAM!")).toBe("“scam”");
    expect(moderationReason(moderation, "scampi looks great")).toBeNull();
    expect(moderationReason(moderation, "check out cheap-followers.xyz now")).toBe("link");
    expect(moderationReason(moderation, "Love this 😍")).toBeNull();
    expect(moderationReason({ ...moderation, enabled: false }, "scam")).toBeNull();
  });
});

describe("click-to-DM ad attribution", () => {
  it("stores the ad id as custom fields", async () => {
    const { referralFields } = await import("@/lib/channels/zernio");
    expect(referralFields({ ad_id: "120200", source: "ADS" })).toEqual({ ad_id: "120200", ad_source: "ADS" });
    expect(referralFields({ ref: "x" } as never)).toBeUndefined();
    expect(referralFields(null)).toBeUndefined();
  });
});
