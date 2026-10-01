import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { log } from "@/lib/logger";
import type { ContactRecord } from "@/lib/types";

/**
 * Relay's AI layer (Claude). One place for the client, model, structured outputs and refusal
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
