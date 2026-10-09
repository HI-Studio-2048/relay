import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { log } from "@/lib/logger";
import type { ContactRecord } from "@/lib/types";

/**
 * Recatch's AI layer (Claude). One place for the client, model, structured outputs and refusal
 * handling. Every call opts into server-side refusal fallbacks ("default" routes by category).
 */
export const AI_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AiUnavailableError extends Error {
  constructor(message = "AI is off: set ANTHROPIC_API_KEY on the server") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const globalForAi = globalThis as unknown as { relayAnthropic?: Anthropic };

function client() {
  if (!aiConfigured()) throw new AiUnavailableError();
  globalForAi.relayAnthropic ??= new Anthropic();
  return globalForAi.relayAnthropic;
}

/** Per-account AI settings, stored on bots.settings.ai. */
export type BotAiSettings = {
  /** Who the assistant is and how it sounds. */
  persona?: string;
  /** Facts it may use: prices, hours, links, policies, FAQs. */
  knowledge?: string;
  /** Answer messages that match no flow or keyword with AI. */
  autoReply?: boolean;
  /** Said when the AI hands the conversation to a human. */
  handoffMessage?: string;
};

export function readAiSettings(settings: Record<string, unknown> | null | undefined): BotAiSettings {
  const raw = (settings?.ai ?? {}) as BotAiSettings;
  return {
    persona: typeof raw.persona === "string" ? raw.persona : "",
    knowledge: typeof raw.knowledge === "string" ? raw.knowledge : "",
    autoReply: Boolean(raw.autoReply),
    handoffMessage: typeof raw.handoffMessage === "string" ? raw.handoffMessage : "",
  };
}

export type HistoryLine = { direction: "inbound" | "outbound"; body: string };

/** Stable per account, so it is the cached prefix. Per-contact detail goes in the user turn. */
function systemPrompt(settings: BotAiSettings, brandName: string) {
  return [
    `You are the messaging assistant for ${brandName}, replying to people in their DMs on social media and chat apps.`,
    settings.persona?.trim() ? `Voice and role:\n${settings.persona.trim()}` : "Be warm, brief and helpful.",
    settings.knowledge?.trim()
      ? `Business knowledge (the only facts you may state about the business):\n${settings.knowledge.trim()}`
      : "You have no business knowledge base. Do not invent prices, policies, dates or links.",
    [
      "How to write replies:",
      "- This is a DM thread: 1-3 short sentences, plain text, no markdown headings or bullet lists unless asked.",
      "- Match the person's language.",
      "- If the answer is not in the business knowledge, say you will check with the team and set handoff to true rather than guessing.",
      "- Set handoff to true when the person asks for a human, is upset, or needs something only staff can do (refunds, account changes, custom quotes).",
    ].join("\n"),
  ].join("\n\n");
}

function contactBrief(contact: ContactRecord) {
  const visible = Object.entries(contact.customFields).filter(([key]) => !key.startsWith("_"));
  return [
    `Name: ${[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "unknown"}`,
    contact.username ? `Username: @${contact.username}` : null,
    contact.platform ? `Platform: ${contact.platform}` : null,
    contact.email ? `Email: ${contact.email}` : null,
    contact.phone ? `Phone: ${contact.phone}` : null,
    contact.tags.length ? `Tags: ${contact.tags.join(", ")}` : null,
    ...visible.map(([key, value]) => `${key}: ${value}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function transcript(history: HistoryLine[]) {
  return history
    .slice(-30)
    .map((line) => `${line.direction === "inbound" ? "Customer" : "Business"}: ${line.body}`)
    .join("\n");
}

type ParseInput = {
  system: string;
  user: string;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
};

async function parse<T extends z.ZodType>(schema: T, input: ParseInput): Promise<z.infer<T>> {
  const response = await client().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: input.maxTokens ?? 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: input.user }],
    output_config: { effort: input.effort, format: betaZodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") {
    log.warn("AI declined a request", response.stop_details?.category ?? "uncategorized");
    throw new AiUnavailableError("The AI declined to answer this one");
  }
  if (!response.parsed_output) throw new AiUnavailableError("The AI returned an unreadable answer");
  return response.parsed_output as z.infer<T>;
}

const ConverseSchema = z.object({
  reply: z.string().describe("The message to send to the customer. Empty only if handing off with nothing to say."),
  goal_complete: z.boolean().describe("True once the goal of this step is fully achieved."),
  handoff: z.boolean().describe("True if a human should take over."),
  collected: z
    .array(z.object({ field: z.string(), value: z.string() }))
    .describe("Details the customer stated in their latest message, for the fields you were asked to collect."),
});

export type ConverseResult = {
  reply: string;
  goalComplete: boolean;
  handoff: boolean;
  collected: Record<string, string>;
};

/**
 * One AI turn in a conversation. With a goal (AI Step in a flow) the model also reports whether
 * the goal is met and which requested fields it picked up; without one it is a free-form answer
 * (AI auto-reply for unmatched messages).
 */
export async function converse(input: {
  settings: BotAiSettings;
  brandName: string;
  contact: ContactRecord;
  history: HistoryLine[];
  goal?: string;
  collect?: string[];
}): Promise<ConverseResult> {
  const task = input.goal?.trim()
    ? [
        `Goal of this conversation step: ${input.goal.trim()}`,
        input.collect?.length
          ? `Collect these details if the customer gives them (use these exact field keys): ${input.collect.join(", ")}. Ask for missing ones naturally, one at a time.`
          : null,
        "Set goal_complete to true only when the goal is done. When it is, your reply should wrap up this part briefly.",
      ]
        .filter(Boolean)
        .join("\n")
    : "Answer the customer's latest message. goal_complete is always false here.";
  const result = await parse(ConverseSchema, {
    system: systemPrompt(input.settings, input.brandName),
    effort: "low",
    user: [`<customer>\n${contactBrief(input.contact)}\n</customer>`, `<conversation>\n${transcript(input.history)}\n</conversation>`, task].join("\n\n"),
  });
  const allowed = new Set(input.collect ?? []);
  return {
    reply: result.reply.trim(),
    goalComplete: result.goal_complete,
    handoff: result.handoff,
    collected: Object.fromEntries(
      result.collected
        .filter((item) => allowed.has(item.field) && item.value.trim())
        .map((item) => [item.field, item.value.trim()]),
    ),
  };
}

const SuggestSchema = z.object({
  suggestions: z.array(z.string()).describe("Three distinct reply drafts, best first."),
  summary: z.string().describe("One sentence: what this person wants and where things stand."),
  intent: z.string().describe("Two to four words, e.g. 'pricing question', 'ready to buy', 'complaint'."),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});

export type InboxAssist = z.infer<typeof SuggestSchema>;

/** Live Chat copilot: reply drafts plus a one-line read on the conversation. */
export async function assistInbox(input: {
  settings: BotAiSettings;
  brandName: string;
  contact: ContactRecord;
  history: HistoryLine[];
}): Promise<InboxAssist> {
  const result = await parse(SuggestSchema, {
    system: systemPrompt(input.settings, input.brandName),
    effort: "low",
    user: [
      `<customer>\n${contactBrief(input.contact)}\n</customer>`,
      `<conversation>\n${transcript(input.history)}\n</conversation>`,
      "A human teammate is about to reply. Draft three short replies they could send next, in the business's voice, and summarize the conversation.",
    ].join("\n\n"),
  });
  return { ...result, suggestions: result.suggestions.map((item) => item.trim()).filter(Boolean).slice(0, 3) };
}

const IntentSchema = z.object({
  intent: z.string().describe("The id of the matching intent, or \"none\"."),
});

export type IntentOption = { id: string; description: string };

/**
 * ManyChat AI Intents: pick which described intent (if any) a message expresses. Returns the intent id,
 * or null when nothing fits well. Keywords stay the fast path; this only runs when no keyword matched.
 */
export async function classifyIntent(input: { text: string; intents: IntentOption[]; brandName: string }): Promise<string | null> {
  if (input.intents.length === 0 || !input.text.trim()) return null;
  const list = input.intents.map((intent) => `- ${intent.id}: ${intent.description}`).join("\n");
  const result = await parse(IntentSchema, {
    system: [
      `You route incoming DMs for ${input.brandName} to the right automation.`,
      "Pick the intent the message clearly expresses. If none clearly fits, or the message is only a greeting or small talk, answer \"none\".",
    ].join("\n"),
    effort: "low",
    maxTokens: 2000,
    user: `<intents>\n${list}\n</intents>\n\n<message>\n${input.text.slice(0, 1000)}\n</message>`,
  });
  return input.intents.some((intent) => intent.id === result.intent) ? result.intent : null;
}

const TranslateSchema = z.object({
  source_language: z.string().describe("English name of the language the text is written in, e.g. Spanish."),
  translation: z.string().describe("The text in the target language. Unchanged if it is already in that language."),
});

export type Translation = { sourceLanguage: string; translation: string };

/**
 * Live Chat translation. `target` is a language name, or null to use the language the customer writes
 * in (inferred from `customerSamples`). Keeps emoji, links, names and {{variables}} as they are.
 */
export async function translateText(input: { text: string; target: string | null; customerSamples?: string[] }): Promise<Translation> {
  const target = input.target
    ? input.target
    : `the language the customer writes in (see their messages below)`;
  const samples = (input.customerSamples ?? []).filter(Boolean).slice(-5);
  const result = await parse(TranslateSchema, {
    system: [
      "You translate direct messages between a business and its customers.",
      "Translate naturally, keep the tone and length. Keep emoji, URLs, @handles, product names and {{variables}} exactly as they are.",
    ].join("\n"),
    effort: "low",
    maxTokens: 4000,
    user: [
      samples.length ? `<customer_messages>\n${samples.map((line) => line.slice(0, 300)).join("\n")}\n</customer_messages>` : "",
      `Translate into ${target}.`,
      `<text>\n${input.text.slice(0, 4000)}\n</text>`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  return { sourceLanguage: result.source_language, translation: result.translation };
}

const KnowledgeSchema = z.object({
  knowledge: z.string().describe("Plain-text facts, one per line, grouped under short headings."),
});

/** "Import from website": distill a page into facts the assistant may quote (prices, hours, policies, FAQs). */
export async function extractKnowledge(input: { pageText: string; url: string; brandName: string }) {
  const result = await parse(KnowledgeSchema, {
    system: [
      `You prepare the knowledge base a DM assistant for ${input.brandName} will answer from.`,
      "From the page, keep only concrete facts a customer might ask about: products and prices, plans, hours, locations, shipping, returns and refunds, booking links, contact details, FAQs.",
      "Skip navigation, marketing fluff, cookie banners and legal boilerplate. Never invent facts. Keep links exactly as written.",
      "Write short lines under headings like 'Prices:' or 'FAQ:'. At most about 60 lines.",
    ].join("\n"),
    effort: "low",
    maxTokens: 6000,
    user: `<page url="${input.url.replace(/"/g, "")}">\n${input.pageText}\n</page>`,
  });
  return result.knowledge.trim();
}

const CommentReplySchema = z.object({ reply: z.string().describe("The public reply, under 120 characters.") });

/** A short public reply under someone's comment, pointing them to their DMs. */
export async function writeCommentReply(input: {
  comment: string;
  postCaption?: string | null;
  examples: string[];
  settings: BotAiSettings;
  brandName: string;
}) {
  const result = await parse(CommentReplySchema, {
    system: [
      `You reply publicly to comments on ${input.brandName}'s social posts. A DM with details was just sent to the commenter.`,
      input.settings.persona?.trim() ? `Brand voice:\n${input.settings.persona.trim()}` : "",
      "Write one short, warm, specific reply (under 120 characters, at most one emoji) that acknowledges what they said and tells them to check their DMs. No hashtags, no links, no prices, never promise anything not in the comment.",
      input.examples.length ? `Replies the brand likes:\n${input.examples.slice(0, 5).map((line) => `- ${line}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    effort: "low",
    maxTokens: 1000,
    user: [
      input.postCaption ? `<post>\n${input.postCaption.slice(0, 500)}\n</post>` : "",
      `<comment>\n${input.comment.slice(0, 500)}\n</comment>`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  return safePublicReply(result.reply);
}

/**
 * A public reply is posted under the brand's name, and the comment it answers is attacker-controlled
 * text. Refuse anything with links, domains, @mentions or hashtags (the caller falls back to a preset).
 */
export function safePublicReply(reply: string): string {
  const text = reply.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!text) throw new AiUnavailableError("Empty reply");
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ly|co|xyz|link|shop|me|app|gg|info|biz|ru|tk)\b|@\w|#\w)/i.test(text)) {
    throw new AiUnavailableError("Reply contained a link, mention or hashtag");
  }
  return text;
}

const DigestSchema = z.object({
  headline: z.string().describe("One sentence: the most important thing about this week."),
  highlights: z.array(z.string()).describe("2-4 short observations grounded in the numbers."),
  next_steps: z.array(z.string()).describe("2-3 concrete actions to take in Recatch this week."),
});

export type WeeklyDigest = z.infer<typeof DigestSchema>;

/** Overview "Weekly digest": Claude reads the account's numbers and says what happened and what to do. */
export async function writeWeeklyDigest(input: { brandName: string; facts: Record<string, unknown> }): Promise<WeeklyDigest> {
  return parse(DigestSchema, {
    system: [
      `You are the growth analyst for ${input.brandName}'s social DM automation (comment-to-DM, flows, broadcasts, live chat).`,
      "Use only the numbers given. Be specific and brief; no fluff, no invented metrics. Next steps must be things the user can do in the app (a flow, a broadcast, a keyword, replying to waiting chats, AI knowledge).",
    ].join("\n"),
    effort: "low",
    maxTokens: 3000,
    user: `<numbers>\n${JSON.stringify(input.facts, null, 2)}\n</numbers>`,
  });
}

const BroadcastDraftSchema = z.object({
  version_a: z.string().describe("The broadcast message."),
  version_b: z.string().describe("A genuinely different angle (hook, offer framing or call to action) for an A/B test."),
});

/** Compose broadcast "✨ Write it": two DM-sized versions in the brand voice. */
export async function draftBroadcast(input: { goal: string; settings: BotAiSettings; brandName: string }) {
  const result = await parse(BroadcastDraftSchema, {
    system: [
      `You write broadcast DMs that ${input.brandName} sends to subscribers on Instagram, Messenger, WhatsApp and other chat apps.`,
      input.settings.persona?.trim() ? `Brand voice:\n${input.settings.persona.trim()}` : "",
      input.settings.knowledge?.trim() ? `Facts you may use:\n${input.settings.knowledge.trim().slice(0, 4000)}` : "",
      "Rules: under 300 characters each, personal ({{first_name|there}} works), one clear call to action, at most two emoji, no hashtags, never invent prices or dates that the goal or facts do not give.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    effort: "low",
    maxTokens: 3000,
    user: `<goal>\n${input.goal.slice(0, 1000)}\n</goal>`,
  });
  return { a: result.version_a.trim(), b: result.version_b.trim() };
}

export const REWRITE_STYLES = {
  shorter: "Make it shorter and punchier. DM-sized.",
  friendlier: "Make it warmer and friendlier, still professional.",
  persuasive: "Make it more persuasive with a clear call to action, without being pushy.",
  emoji: "Add a few fitting emoji. Change nothing else.",
  fix: "Fix spelling and grammar only. Keep the wording.",
} as const;

export type RewriteStyle = keyof typeof REWRITE_STYLES;

const RewriteSchema = z.object({ text: z.string() });

/** Flow editor "✨ Rewrite": the same message in the brand voice, one style at a time. */
export async function rewriteCopy(input: { text: string; style: RewriteStyle; settings: BotAiSettings; brandName: string }) {
  const result = await parse(RewriteSchema, {
    system: [
      `You edit chat messages that ${input.brandName} sends in DMs.`,
      input.settings.persona?.trim() ? `Brand voice:\n${input.settings.persona.trim()}` : "",
      "Keep {{variables}}, URLs, @handles and **formatting** markers exactly as they are. Same language as the input.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    effort: "low",
    maxTokens: 3000,
    user: `${REWRITE_STYLES[input.style]}\n\n<message>\n${input.text.slice(0, 2000)}\n</message>`,
  });
  return result.text.trim();
}

const GeneratedFlowSchema = z.object({
  name: z.string(),
  trigger: z.object({
    type: z.enum(["start", "keyword_contains", "comment", "story_reply", "story_mention", "default"]),
    keywords: z.string().describe("Comma-separated keywords, empty for any."),
    public_replies: z.array(z.string()).describe("Only for comment triggers: public replies posted under the comment."),
  }),
  steps: z
    .array(
      z.object({
        id: z.string().describe("Short unique id like s1, s2."),
        type: z.enum(["message", "question", "tag", "delay", "ai", "end"]),
        text: z.string().describe("message: the text; question: the prompt; ai: the goal; end: optional closing text."),
        buttons: z
          .array(z.object({ label: z.string(), next: z.string().describe("Step id, or empty"), url: z.string().describe("https URL for link buttons, else empty") }))
          .describe("Up to 3 buttons on a message step; empty otherwise."),
        field: z.string().describe("question: name, email, phone, or a custom snake_case key. Empty otherwise."),
        tag: z.string().describe("tag: the tag name. Empty otherwise."),
        minutes: z.number().describe("delay: minutes to wait. 0 otherwise."),
        next: z.string().describe("Next step id, or empty to stop (or to wait for a button tap)."),
      }),
    )
    .describe("Steps in order; the first one runs first."),
});

export type GeneratedFlow = z.infer<typeof GeneratedFlowSchema>;

/** Describe an automation in plain words; get a flow skeleton you can edit on the canvas. */
export async function generateFlowDraft(prompt: string, settings: BotAiSettings, brandName: string): Promise<GeneratedFlow> {
  return parse(GeneratedFlowSchema, {
    system: [
      `You design chat automations (like ManyChat flows) for ${brandName}.`,
      settings.knowledge?.trim() ? `Business knowledge:\n${settings.knowledge.trim()}` : "",
      [
        "Rules:",
        "- Keep it short: 3-8 steps. DM-sized messages.",
        "- Comment-to-DM flows: the first step is a message with one button (the platform allows one DM until the person replies); the rest follows the button.",
        "- Use question steps to collect email/phone/name before sending a lead magnet when it makes sense.",
        "- Use an ai step only for open-ended conversation (its text is the goal).",
        "- Personalize with {{first_name}}.",
      ].join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n"),
    effort: "medium",
    user: prompt,
  });
}

const InsightsSchema = z.object({
  summary: z.string().describe("Two or three sentences on what people are messaging about."),
  topics: z
    .array(
      z.object({
        topic: z.string().describe("Short name, e.g. 'Shipping times'."),
        share: z.number().describe("Rough percent of these conversations about it, 0-100."),
        example: z.string().describe("One representative customer message, quoted."),
        covered: z.boolean().describe("True if the business knowledge already answers it."),
        suggested_answer: z.string().describe("For uncovered topics: a knowledge-base entry the business could add (facts in brackets where unknown). Empty if covered."),
      }),
    )
    .describe("Up to 8 topics, most common first."),
  sentiment: z.object({ positive: z.number(), neutral: z.number(), negative: z.number() }).describe("Percent split, summing to 100."),
  opportunities: z.array(z.string()).describe("Up to 3 concrete automation ideas (a flow, keyword or template to add)."),
});

export type ConversationInsights = z.infer<typeof InsightsSchema>;

/** Read recent inbound messages and say what people ask, what is not covered, and what to automate next. */
export async function analyzeConversations(input: { settings: BotAiSettings; brandName: string; messages: { contact: string; text: string }[] }) {
  const sample = input.messages
    .slice(-400)
    .map((message) => `- (${message.contact}) ${message.text.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  return parse(InsightsSchema, {
    system: systemPrompt(input.settings, input.brandName),
    effort: "medium",
    user: [
      "You are reviewing a business's recent inbound DMs and comments to improve their automation.",
      `<messages>\n${sample}\n</messages>`,
      "Group them into topics, say which ones the business knowledge already covers, draft knowledge entries for the gaps, and suggest automations. Ignore greetings and button taps.",
    ].join("\n\n"),
  });
}

const AutoTagSchema = z.object({
  tags: z.array(z.string()).describe("Names of the tags whose description the message clearly fits. Empty if none."),
});

/** Ask Claude which described tags fit this message; returns the matching tag names. */
export async function classifyAutoTags(text: string, rules: { tag: string; description: string }[], brandName: string): Promise<string[]> {
  if (rules.length === 0) return [];
  const list = rules.map((rule) => `- ${rule.tag}: ${rule.description}`).join("\n");
  const result = await parse(AutoTagSchema, {
    system: [
      `You label incoming DMs for ${brandName}'s CRM.`,
      "Return the tags whose description the message clearly fits. Be conservative: no tag for greetings, small talk or vague messages.",
    ].join("\n"),
    effort: "low",
    maxTokens: 1000,
    user: `<tags>\n${list}\n</tags>\n\n<message>\n${text.slice(0, 1000)}\n</message>`,
  });
  const allowed = new Map(rules.map((rule) => [rule.tag.toLowerCase(), rule.tag]));
  return [...new Set(result.tags.map((tag) => allowed.get(tag.trim().toLowerCase())).filter((tag): tag is string => Boolean(tag)))];
}
