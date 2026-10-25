import { createAgentCompletion, type AgentEffort, type AgentMessage, type AgentTurn } from "@/lib/ai";
import type { AiProvider } from "@/lib/ai-provider";
import { budgetExhaustedMessage, readAssistantBudget, recordAssistantUsage, type AssistantBudget } from "@/lib/agent/budget";
import type { AgentUsage } from "@/lib/agent/pricing";
import { AGENT_TOOLS, runAgentTool, type DraftLink } from "@/lib/agent/tools";
import { CHANNEL_CATALOG } from "@/lib/channels/catalog";

function networksGuide() {
  const live = CHANNEL_CATALOG.filter((entry) => entry.state === "live").map((entry) => `${entry.label} (${entry.how})`);
  const meta = CHANNEL_CATALOG.filter((entry) => entry.state === "meta").map((entry) => entry.label);
  const soon = CHANNEL_CATALOG.filter((entry) => entry.state === "soon").map((entry) => entry.label);
  return [
    `- Connect today: ${live.join(", ")}.`,
    `- ${meta.join(", ")}: Connect on the Channels page and sign in with Meta when that button shows; otherwise it asks for their own Meta app token.`,
    `- Coming later, not connectable yet: ${soon.join(", ")}.`,
  ].join("\n");
}

/** Fixed for the life of the process, so Claude caches it together with the tools. Per-message facts go in run's context. */
export const ASSISTANT_SYSTEM = [
  "You are the Recatch assistant, built into the Recatch dashboard. Recatch automates a business's social conversations: comment-to-DM, keyword replies, lead capture, a shared inbox, broadcasts and AI replies to customers. You talk with the business owner who is signed in, by text or out loud. Your three jobs: get new customers set up, build funnels for them, and answer how-to and how-am-I-doing questions.",
  "",
  "Ground rules:",
  "- Call tools for any number, name, tag or flow you mention, unless the workspace facts below already give it. Never invent stats, and never claim you changed something a tool did not confirm.",
  "- You cannot turn a flow on, send a broadcast, or message a contact. Those tools do not exist. create_draft_flow, update_draft_flow and create_funnel_from_template always save a draft that is off; create_draft_broadcast saves a draft nobody receives until they confirm it.",
  "- When they ask you to send, publish or turn something on, save the draft (or say you will not) and tell them which button to press themselves.",
  "- Put a new flow on the channel they name. With several channels connected and none named, ask which one before creating it. Use the channel ids from the workspace facts.",
  "- Only do what they asked. If a request is vague, ask one short question, and never more than one at a time.",
  "- You stay with them on every page of Recatch, and the conversation (spoken or typed) carries on while they move around. Open a page for them with open_page when they ask to see or go somewhere (\"show me my flows\"), or to show a draft you just saved, then keep talking about what is on it. The workspace facts say which page they are on.",
  "",
  "Building funnels (a funnel is a flow: a trigger, then steps):",
  "- Triggers: a keyword in a comment on their posts (Instagram, Facebook, YouTube, Bluesky), a keyword in a DM, a story reply or story mention (Instagram), or the first message someone sends.",
  "- A comment trigger with no keyword answers every comment on every post, so set a keyword unless they want exactly that. YouTube has no DMs: a YouTube flow can only reply to comments in public.",
  "- Steps: messages with up to three buttons, questions that save name, email, phone or a custom field (question field company is stored as custom:company), tags, delays, an AI conversation step, and an end message.",
  "- Start from a template when one fits: list_funnel_templates, then create_funnel_from_template with their keyword. Otherwise write one with create_draft_flow.",
  "- A good funnel is short: a hook that delivers what was promised, one or two questions, a tag, and a clear next step. Comment funnels get two or three short public replies. Lead-capture funnels ask for name, email and phone, plus a custom field when one fits.",
  "- Use the links they give you. Without one, put https://example.com and tell them to swap in the real link in the editor.",
  "- After saving a draft, name it and say how to go live: open it from the link, read it through, try it with Test, then switch it on with the Turn on toggle on the Flows page.",
  "- For converting leads they already have, look at their stats, tags and fields first, then offer one concrete next step: a follow-up draft flow, or a broadcast draft to a tag.",
  "",
  "Getting started (for new customers, go one step at a time and wait for them):",
  "1. Connect a channel on [Channels](/channels).",
  "2. Teach the AI their business on [AI assistant](/ai): prices, links and answers to common questions.",
  "3. Their first funnel, usually comment-to-DM on Instagram: ask what they want to give away or sell, then build it.",
  "4. Test it, turn it on, and watch replies arrive in [Inbox](/inbox).",
  "5. Then a growth link or website widget on [Links](/growth), and their team under [Settings](/setup).",
  "",
  "Networks:",
  networksGuide(),
  "",
  "Where things are (link a page with a markdown link to its path, like [Flows](/flows)):",
  "- [Overview](/): stats across channels, and you. [Inbox](/inbox): every conversation in one place; reply, assign, add notes. [Contacts](/contacts): people, tags, fields, segments, CSV import and export.",
  "- [Channels](/channels): connect and reconnect networks. [All accounts](/accounts): every connected account side by side.",
  "- [Flows](/flows): funnels, templates, the AI flow builder, Test, and the Turn on toggle. [Keywords](/keywords): DM keywords that start flows. [Starters & hours](/starters): conversation starters, menus, business hours, comment moderation.",
  "- [Sequences](/sequences): follow-ups spread over days. [Rules](/rules): when something happens, tag or update a contact. [Broadcasts](/broadcasts): message a tag or segment, sent only after they confirm.",
  "- [AI assistant](/ai): the AI that replies to their customers (knowledge, tone, auto-reply, their own OpenRouter key). It is not you.",
  "- [Links](/growth): growth links, QR codes and the website widget. [API & webhooks](/integrations): API keys and webhooks. [Settings](/setup): account settings, team members and alerts.",
  "",
  "How you write:",
  "- Short and concrete: two to five sentences, or a short numbered list for steps. Plain words, no jargon.",
  "- Markdown links only for Recatch pages and draft links. No headings, tables or images.",
  "- Reply in the language they write in.",
].join("\n");

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "draft"; draft: DraftLink }
  | { type: "navigate"; href: string }
  | { type: "budget"; budget: AssistantBudget };

export type AgentComplete = (input: {
  system: string;
  context: string;
  messages: AgentMessage[];
  effort: AgentEffort;
  onText: (delta: string) => void;
  onUsage?: (usage: AgentUsage) => Promise<void> | void;
  signal?: AbortSignal;
}) => Promise<AgentTurn>;

const TOOL_SPECS = AGENT_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.input_schema as Record<string, unknown>,
}));

/** Model calls per message: enough to look something up, save a draft and answer. */
const MAX_STEPS = 6;

const REFUSAL_REPLY = "I can't help with that one. I'm happy to help with your channels, funnels and setup.";

/** The real model call. `provider` is the login's OpenRouter key, or undefined for the server key. */
export function modelAgentComplete(provider?: AiProvider): AgentComplete {
  return (input) =>
    createAgentCompletion({
      system: input.system,
      context: input.context,
      messages: input.messages,
      tools: TOOL_SPECS,
      provider,
      effort: input.effort,
      onText: input.onText,
      onUsage: input.onUsage,
      signal: input.signal,
    });
}

function chunkText(text: string) {
  const size = 80;
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size));
  return parts.length ? parts : [text];
}

/**
 * Tool loop for one user message. `complete` is injectable so tests never call a model. Writes stay
 * inside the tools, which refuse to activate a flow or send a broadcast. On the server's key every call
 * is checked against and added to the login's monthly allowance (agent/budget.ts); an OpenRouter key
 * is the customer's own and is not counted.
 */
export async function runWorkspaceAgent(input: {
  ownerId: string;
  history: { role: string; body: string }[];
  message: string;
  onEvent?: (event: AgentEvent) => void;
  /** The login's OpenRouter key (see agent/provider.ts). Undefined uses the server's Anthropic key. */
  provider?: AiProvider;
  /** Workspace facts for this message, from agent/context.ts. */
  context?: string;
  /** Talking out loud: quicker, shorter answers. */
  voice?: boolean;
  signal?: AbortSignal;
  complete?: AgentComplete;
}) {
  const complete = input.complete ?? modelAgentComplete(input.provider);
  const budgeted = !input.provider;
  const messages: AgentMessage[] = [
    ...input.history
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-20)
      .map((item): AgentMessage =>
        item.role === "user"
          ? { role: "user", content: item.body }
          : { role: "assistant", content: item.body, toolCalls: [] },
      ),
    { role: "user", content: input.message },
  ];
  const drafts: DraftLink[] = [];
  let reply = "";
  const say = (text: string) => {
    if (!text) return;
    reply += text;
    input.onEvent?.({ type: "delta", text });
  };
  /** A whole piece of text that was not streamed, set apart from anything already said. */
  const sayAll = (text: string) => {
    if (!text) return;
    if (reply.trim()) say("\n\n");
    for (const part of chunkText(text)) say(part);
  };
  const onUsage = budgeted ? (usage: AgentUsage) => recordAssistantUsage(input.ownerId, usage) : undefined;
  let finished = false;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (budgeted) {
      const budget = await readAssistantBudget(input.ownerId);
      if (budget.exhausted) {
        sayAll(budgetExhaustedMessage(budget));
        finished = true;
        break;
      }
    }
    let streaming = false;
    const turn = await complete({
      system: ASSISTANT_SYSTEM,
      context: input.context ?? "",
      messages,
      effort: input.voice ? "low" : "medium",
      onText: (delta) => {
        if (!delta) return;
        if (!streaming && reply.trim()) say("\n\n");
        streaming = true;
        say(delta);
      },
      onUsage,
      signal: input.signal,
    });
    const shown = turn.streamed && streaming;
    if (turn.stopReason === "refusal") {
      if (!shown) sayAll(turn.text || REFUSAL_REPLY);
      finished = true;
      break;
    }
    if (turn.toolCalls.length === 0) {
      if (!shown) sayAll(turn.text);
      finished = true;
      break;
    }
    if (turn.stopReason === "max_tokens") {
      // A tool call cut off at the token limit is incomplete, so it never runs.
      sayAll("That got too long to build in one go. Ask me for a shorter version, or build it in two parts.");
      finished = true;
      break;
    }
    messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls, blocks: turn.blocks });
    for (const call of turn.toolCalls) {
      const tool = AGENT_TOOLS.find((item) => item.name === call.name);
      input.onEvent?.({ type: "status", text: tool?.label ?? "Working" });
      let result;
      let failed = false;
      try {
        result = await runAgentTool(input.ownerId, call.name, call.input);
      } catch (error) {
        failed = true;
        result = { output: { error: error instanceof Error ? error.message : "Tool failed" } };
      }
      if (result.draft) {
        drafts.push(result.draft);
        input.onEvent?.({ type: "draft", draft: result.draft });
      }
      if (result.navigate) input.onEvent?.({ type: "navigate", href: result.navigate });
      const output = result.output;
      const isError = failed || Boolean(output && typeof output === "object" && "error" in output);
      messages.push({ role: "tool", id: call.id, content: JSON.stringify(output).slice(0, 12000), isError });
    }
  }
  if (!finished) sayAll("I stopped after several steps. Open any draft I saved and tell me what to adjust.");
  if (!reply.trim()) sayAll("I could not put an answer together. Try asking again with a channel name.");
  if (budgeted) input.onEvent?.({ type: "budget", budget: await readAssistantBudget(input.ownerId) });
  return { reply: reply.trim(), drafts };
}
