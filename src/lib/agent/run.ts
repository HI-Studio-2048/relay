import { createAgentCompletion, type AgentMessage, type AgentToolCall } from "@/lib/ai";
import type { AiProvider } from "@/lib/ai-provider";
import { AGENT_TOOLS, runAgentTool, type DraftLink } from "@/lib/agent/tools";

const SYSTEM = [
  "You are Recatch's growth agent inside one workspace. You help the owner understand their channels and draft automations.",
  "Call tools for any number, name, tag, or flow. Never invent stats or claim you changed something a tool did not confirm.",
  "Hard rules:",
  "- You cannot activate a flow, send a broadcast, or message a contact. Those tools do not exist.",
  "- create_draft_flow and update_draft_flow always save an inactive draft. Tell the user to open the flow and turn it on themselves.",
  "- create_draft_broadcast only saves a draft. Tell the user to open it and confirm before anyone is contacted.",
  "- If they ask you to send, publish, or turn something on, say you saved a draft (or that you will not do it) and point them at the button in the app.",
  "- Lead-capture flows collect name, email, and phone, and a custom field when one is relevant (question field \"company\" is stored as custom:company).",
  "- Put a new flow on the channel they name. If several channels are connected and they did not name one, ask which channel before creating it.",
  "- When you talk about converting leads, use the workspace stats, tags, and fields, then offer a concrete next step such as a follow-up draft flow or a tag-scoped broadcast draft.",
  "Keep replies short. When you create something, name it and say it is a draft.",
].join("\n");

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "draft"; draft: DraftLink };

export type AgentComplete = (input: { system: string; messages: AgentMessage[] }) => Promise<{
  text: string;
  toolCalls: AgentToolCall[];
}>;

const TOOL_SPECS = AGENT_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.input_schema as Record<string, unknown>,
}));

/** The real model call. `provider` is the login's OpenRouter key, or undefined for the server key. */
export function modelAgentComplete(provider?: AiProvider): AgentComplete {
  return (input) => createAgentCompletion({ system: input.system, messages: input.messages, tools: TOOL_SPECS, provider });
}

function chunkText(text: string) {
  const size = 80;
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size));
  return parts.length ? parts : [text];
}

/**
 * Tool loop for one user message. `complete` is injectable so tests never call a model.
 * Writes stay inside the tools, which refuse to activate a flow or send a broadcast.
 */
export async function runWorkspaceAgent(input: {
  ownerId: string;
  history: { role: string; body: string }[];
  message: string;
  onEvent?: (event: AgentEvent) => void;
  /** The login's OpenRouter key (see agent/provider.ts). Undefined uses the server's Anthropic key. */
  provider?: AiProvider;
  complete?: AgentComplete;
}) {
  const complete = input.complete ?? modelAgentComplete(input.provider);
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
  for (let step = 0; step < 6; step += 1) {
    const turn = await complete({ system: SYSTEM, messages });
    if (turn.toolCalls.length === 0) {
      reply = turn.text || "I could not put an answer together. Try asking again with a channel name.";
      break;
    }
    messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls });
    for (const call of turn.toolCalls) {
      const tool = AGENT_TOOLS.find((item) => item.name === call.name);
      input.onEvent?.({ type: "status", text: tool?.label ?? "Working" });
      let result;
      try {
        result = await runAgentTool(input.ownerId, call.name, call.input);
      } catch (error) {
        result = { output: { error: error instanceof Error ? error.message : "Tool failed" } };
      }
      if (result.draft) {
        drafts.push(result.draft);
        input.onEvent?.({ type: "draft", draft: result.draft });
      }
      messages.push({ role: "tool", id: call.id, content: JSON.stringify(result.output).slice(0, 12000) });
    }
  }
  if (!reply) reply = "I stopped after several steps. Open any draft I saved and tell me what to adjust.";
  for (const part of chunkText(reply)) input.onEvent?.({ type: "delta", text: part });
  return { reply, drafts };
}
