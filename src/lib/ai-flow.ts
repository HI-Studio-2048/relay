import type { GeneratedFlow } from "@/lib/ai";
import type { FlowDefinition, FlowStep, TriggerType } from "@/lib/types";

const BASIC_FIELDS = new Set(["name", "email", "phone"]);

function captureField(raw: string) {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "answer";
  return BASIC_FIELDS.has(key) ? (key as "name" | "email" | "phone") : (`custom:${key}` as const);
}

/**
 * Turn the AI's flow sketch into an engine definition. Ids are sanitized, dangling links are
 * dropped, and a message with buttons waits for the tap instead of falling through.
 */
export function generatedToDefinition(draft: GeneratedFlow): {
  name: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  definition: FlowDefinition;
} {
  const used = new Set<string>();
  const idMap = new Map<string, string>();
  draft.steps.forEach((step, index) => {
    let id = (step.id || `s${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "") || `s${index + 1}`;
    while (used.has(id)) id = `${id}_${index}`;
    used.add(id);
    idMap.set(step.id, id);
  });
  const link = (target: string | undefined) => (target && idMap.has(target) ? idMap.get(target)! : undefined);

  const steps: FlowStep[] = draft.steps.map((step, index): FlowStep => {
    const id = idMap.get(step.id)!;
    const fallthrough = link(step.next) ?? (index + 1 < draft.steps.length ? idMap.get(draft.steps[index + 1]!.id) : undefined);
    if (step.type === "message") {
      const buttons = step.buttons
        .slice(0, 3)
        .filter((button) => button.label.trim())
        .map((button) =>
          /^https:\/\//i.test(button.url.trim())
            ? { text: button.label.trim(), url: button.url.trim() }
            : { text: button.label.trim(), next: link(button.next) },
        );
      const waits = buttons.some((button) => "next" in button && button.next);
      return {
        id,
        type: "text",
        text: step.text,
        ...(buttons.length ? { buttons } : {}),
        ...(waits ? (link(step.next) ? { next: link(step.next) } : {}) : fallthrough ? { next: fallthrough } : {}),
      };
    }
    if (step.type === "question") {
      return { id, type: "capture", field: captureField(step.field || "answer"), prompt: step.text, next: fallthrough ?? "" };
    }
    if (step.type === "tag") {
      return { id, type: "tag", tagName: step.tag.trim() || "lead", action: "add", next: fallthrough ?? "" };
    }
    if (step.type === "delay") {
      const minutes = Math.max(1, Math.round(step.minutes || 1));
      return { id, type: "delay", seconds: minutes * 60, unit: minutes % 1440 === 0 ? "days" : minutes % 60 === 0 ? "hours" : "minutes", next: fallthrough ?? "" };
    }
    if (step.type === "ai") {
      return { id, type: "ai", goal: step.text, ...(link(step.next) ? { next: link(step.next) } : {}) };
    }
    return { id, type: "end", ...(step.text.trim() ? { text: step.text } : {}) };
  });

  const triggerType = draft.trigger.type as TriggerType;
  const keywords = draft.trigger.keywords.trim();
  return {
    name: draft.name.trim() || "AI-built flow",
    triggerType,
    triggerValue: triggerType === "start" ? "/start" : keywords || null,
    definition: {
      startStepId: steps[0]?.id ?? "end",
      steps: steps.length ? steps : [{ id: "end", type: "end", text: "Thanks!" }],
      ...(triggerType === "comment"
        ? { trigger: { publicReplies: draft.trigger.public_replies.filter((reply) => reply.trim()), oncePerContact: true } }
        : {}),
    },
  };
}
