"use client";

import { useEffect, useRef, useState } from "react";
import { useBot } from "@/components/bot-provider";
import { api } from "@/lib/client";
import { Bot, FastForward, MessageCircle, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { executeFrom, processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { isSocialTrigger } from "@/lib/social-triggers";
import { interpolateTemplate } from "@/lib/template";
import type { ContactRecord, FlowDefinition, FlowEffect, FlowSessionState, OutboundReply, TriggerType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Line =
  | { id: string; kind: "in"; text: string }
  | { id: string; kind: "out"; reply: OutboundReply; live: boolean }
  | { id: string; kind: "note"; text: string; tone?: "ai" | "wait" | "info" };

const newId = () => Math.random().toString(36).slice(2);
/** Wall clock for event handlers (kept out of the component body). */
const wallClock = () => Date.now();

function freshContact(): ContactRecord {
  return {
    id: "sim-contact",
    telegramUserId: "simulator",
    username: "you",
    firstName: "Alex",
    lastName: "Test",
    email: null,
    phone: null,
    customFields: {},
    tags: [],
    subscriptions: [],
    unsubscribed: false,
    welcomed: false,
    notes: "",
    inboxStatus: "open",
    platform: "instagram",
  };
}

function describeEffect(effect: FlowEffect, definition: FlowDefinition): Line | null {
  if (effect.type === "typing") return null;
  if (effect.type === "http") return { id: newId(), kind: "note", text: `Would ${effect.method} ${effect.url}`, tone: "info" };
  if (effect.type === "notify") return { id: newId(), kind: "note", text: `Would notify your team: ${effect.text}`, tone: "info" };
  if (effect.type === "goal") return { id: newId(), kind: "note", text: `🏆 Goal reached: ${effect.name}${effect.value !== undefined ? ` (${effect.value})` : ""}`, tone: "info" };
  const step = definition.steps.find((item) => item.id === effect.stepId);
  return {
    id: newId(),
    kind: "note",
    tone: "ai",
    text: `AI Step — Claude takes over here${step?.type === "ai" ? ` (goal: ${step.goal})` : ""}. Live AI replies run in real conversations; here you can mark the goal reached to continue.`,
  };
}

/**
 * In-browser test run: the real flow engine, a pretend contact, no messages sent.
 * Buttons, quick replies, questions, conditions, A/B splits and delays all behave as in production.
 */
export function FlowSimulator({
  getFlow,
  onClose,
}: {
  getFlow: () => { id: string; triggerType: TriggerType; triggerValue: string | null; definition: FlowDefinition };
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [contact, setContact] = useState<ContactRecord>(freshContact);
  const [session, setSession] = useState<FlowSessionState | null>(null);
  const [text, setText] = useState("");
  const [clock, setClock] = useState(wallClock);
  const bottom = useRef<HTMLDivElement>(null);
  // Bot fields ({{bot.promo_code}}) render like they will in real DMs.
  const { botId } = useBot();
  const [botValues, setBotValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!botId) return;
    let cancelled = false;
    api<{ botFields: { key: string; value: string }[] }>(`/api/bots/${botId}/bot-fields`)
      .then((data) => {
        if (!cancelled) setBotValues(Object.fromEntries(data.botFields.map((field) => [`bot.${field.key}`, field.value])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [botId]);
  // The definition of the run in progress, so render never has to read the canvas.
  const [runDefinition, setRunDefinition] = useState<FlowDefinition | null>(null);

  const flowRecord = (): FlowRecord => {
    const flow = getFlow();
    return { id: flow.id, triggerType: flow.triggerType, triggerValue: flow.triggerValue, isActive: true, definition: flow.definition };
  };

  const apply = (
    result: { contact: ContactRecord; session: FlowSessionState | null; replies: OutboundReply[]; effects: FlowEffect[]; publicReply?: string | null },
    definition: FlowDefinition,
  ) => {
    const next: Line[] = [];
    if (result.publicReply) next.push({ id: newId(), kind: "note", text: `Public reply under the comment: “${interpolateTemplate(result.publicReply, result.contact, botValues)}”`, tone: "info" });
    for (const reply of result.replies) next.push({ id: newId(), kind: "out", reply: {
          ...reply,
          text: interpolateTemplate(reply.text, result.contact, botValues),
          ...(reply.cards
            ? { cards: reply.cards.map((card) => ({ ...card, title: interpolateTemplate(card.title, result.contact, botValues), ...(card.subtitle ? { subtitle: interpolateTemplate(card.subtitle, result.contact, botValues) } : {}) })) }
            : {}),
        }, live: true });
    for (const effect of result.effects) {
      const line = describeEffect(effect, definition);
      if (line) next.push(line);
    }
    setRunDefinition(definition);
    const finished = result.session === null || result.session.status === "completed";
    if (result.session?.resumeAt) next.push({ id: newId(), kind: "note", text: `Waits until ${new Date(result.session.resumeAt).toLocaleString()}`, tone: "wait" });
    else if (finished && result.replies.length + result.effects.length > 0) next.push({ id: newId(), kind: "note", text: "Flow finished", tone: "info" });
    setLines((current) => [...current.map((line) => (line.kind === "out" ? { ...line, live: false } : line)), ...next]);
    setContact(result.contact);
    setSession(finished ? null : result.session);
    setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 30);
  };

  const start = () => {
    const flow = flowRecord();
    const base = freshContact();
    setLines([]);
    setClock(wallClock());
    const social = isSocialTrigger(flow.triggerType);
    const startText = social ? flow.triggerValue?.split(",")[0]?.trim() || "🔥" : "";
    const intro: Line[] = social
      ? [{ id: newId(), kind: "in", text: flow.triggerType === "story_mention" ? "[mentioned you in their story]" : `${flow.triggerType === "comment" ? "Comment" : "Story reply"}: ${startText}` }]
      : [];
    setLines(intro);
    const initial: FlowSessionState = { id: "sim", contactId: base.id, flowId: flow.id, stepId: flow.definition.startStepId, awaitingInput: false, status: "active" };
    const executed = executeFrom(flow.definition, initial, base, wallClock(), [flow]);
    apply(
      {
        ...executed,
        publicReply: flow.triggerType === "comment" ? flow.definition.trigger?.publicReplies?.[0] ?? null : null,
      },
      flow.definition,
    );
  };

  const send = (input: { text?: string; callbackData?: string; label?: string }) => {
    const flow = flowRecord();
    setLines((current) => [...current, { id: newId(), kind: "in", text: input.label ?? input.text ?? "" }]);
    const result = processInboundEvent({
      contact,
      session,
      flows: [flow],
      event: { telegramUserId: contact.telegramUserId, text: input.text ?? null, callbackData: input.callbackData ?? null },
      now: clock,
    });
    if (result.replies.length === 0 && result.effects.length === 0 && !result.session) {
      setLines((current) => [...current, { id: newId(), kind: "note", text: "Nothing in this flow answers that.", tone: "info" }]);
      setContact(result.contact);
      return;
    }
    apply(result, flow.definition);
  };

  const skipWait = () => {
    if (!session?.resumeAt) return;
    const flow = flowRecord();
    const later = Date.parse(session.resumeAt) + 1000;
    setClock(later);
    apply(executeFrom(flow.definition, session, contact, later, [flow]), flow.definition);
  };

  const finishAi = () => {
    if (!session) return;
    const flow = flowRecord();
    const step = flow.definition.steps.find((item) => item.id === session.stepId);
    if (step?.type !== "ai") return;
    if (!step.next) {
      setSession(null);
      setLines((current) => [...current, { id: newId(), kind: "note", text: "Goal reached — flow finished", tone: "info" }]);
      return;
    }
    apply(executeFrom(flow.definition, { ...session, stepId: step.next, awaitingInput: false }, contact, clock, [flow]), flow.definition);
  };

  const waitingOnAi = session && runDefinition ? runDefinition.steps.find((item) => item.id === session.stepId)?.type === "ai" : false;
  const visibleFields = Object.entries(contact.customFields).filter(([key]) => !key.startsWith("_"));

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l bg-white shadow-xl">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <MessageCircle className="size-4 text-[#0084ff]" />
        <p className="flex-1 text-[14px] font-semibold">Test this flow</p>
        <Button size="sm" variant="outline" onClick={start}>
          <RotateCcw className="size-3.5" />
          {lines.length ? "Restart" : "Start"}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Close simulator" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f4f6f8] p-3">
        {lines.length === 0 ? (
          <div className="mt-10 space-y-2 text-center text-[13px] text-[#6b7280]">
            <Bot className="mx-auto size-8 text-[#c5cdd6]" />
            <p>Runs your unsaved flow with a pretend contact. Nothing is sent to anyone.</p>
            <Button size="sm" onClick={start}>
              Start test
            </Button>
          </div>
        ) : null}
        {lines.map((line) => {
          if (line.kind === "in") {
            return (
              <div key={line.id} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-md bg-[#0084ff] px-3 py-2 text-[13px] text-white">{line.text}</p>
              </div>
            );
          }
          if (line.kind === "note") {
            return (
              <p
                key={line.id}
                className={cn(
                  "mx-auto max-w-[90%] rounded-lg px-2.5 py-1.5 text-center text-[11px]",
                  line.tone === "ai" ? "bg-[#fdf4ff] text-[#a21caf]" : line.tone === "wait" ? "bg-[#eef2ff] text-[#4c6ef5]" : "text-[#6b7280]",
                )}
              >
                {line.tone === "ai" ? <Sparkles className="mr-1 inline size-3" /> : null}
                {line.text}
              </p>
            );
          }
          const reply = line.reply;
          return (
            <div key={line.id} className="flex flex-col items-start gap-1">
              {reply.media ? (
                <p className="rounded-xl bg-white px-3 py-1.5 text-[11px] text-[#6b7280] ring-1 ring-[#e5e7eb]">[{reply.media.kind}] {reply.media.filename ?? "attachment"}</p>
              ) : null}
              {reply.text ? (
                <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[13px] whitespace-pre-wrap text-[#1b1f24] ring-1 ring-[#e5e7eb]">
                  {reply.text}
                </p>
              ) : null}
              {reply.buttons?.length ? (
                <div className="flex w-[85%] flex-col gap-1">
                  {reply.buttons.map((button, index) =>
                    button.url ? (
                      <a key={index} href={button.url} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-3 py-1.5 text-center text-[13px] text-[#0084ff] ring-1 ring-[#e5e7eb]">
                        {button.text} ↗
                      </a>
                    ) : (
                      <button
                        key={index}
                        type="button"
                        disabled={!line.live}
                        onClick={() => send({ callbackData: button.data, label: button.text })}
                        className="rounded-xl bg-white px-3 py-1.5 text-[13px] text-[#0084ff] ring-1 ring-[#e5e7eb] enabled:hover:bg-[#eef6ff] disabled:opacity-50"
                      >
                        {button.text}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
              {reply.cards?.length ? (
                <div className="flex w-full snap-x gap-2 overflow-x-auto pb-1">
                  {reply.cards.map((card, cardIndex) => (
                    <div key={cardIndex} className="w-44 shrink-0 snap-start overflow-hidden rounded-2xl bg-white ring-1 ring-[#e5e7eb]">
                      {card.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.imageUrl} alt="" className="h-24 w-full object-cover" />
                      ) : (
                        <div className="h-24 w-full bg-[#eef1f4]" />
                      )}
                      <div className="space-y-0.5 px-2.5 py-2">
                        <p className="truncate text-[13px] font-medium text-[#1b1f24]">{card.title}</p>
                        {card.subtitle ? <p className="line-clamp-2 text-[11px] text-[#6b7280]">{card.subtitle}</p> : null}
                      </div>
                      {(card.buttons ?? []).map((button, index) =>
                        button.url ? (
                          <a key={index} href={button.url} target="_blank" rel="noreferrer" className="block border-t border-[#f0f2f4] px-2 py-1.5 text-center text-[12px] text-[#0084ff]">
                            {button.text} ↗
                          </a>
                        ) : (
                          <button
                            key={index}
                            type="button"
                            disabled={!line.live}
                            onClick={() => send({ callbackData: button.data, label: button.text })}
                            className="block w-full border-t border-[#f0f2f4] px-2 py-1.5 text-[12px] text-[#0084ff] enabled:hover:bg-[#eef6ff] disabled:opacity-50"
                          >
                            {button.text}
                          </button>
                        ),
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              {reply.keyboard?.length && line.live ? (
                <div className="flex flex-wrap gap-1">
                  {reply.keyboard.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => send({ text: option })}
                      className="rounded-full bg-white px-3 py-1 text-[12px] text-[#0084ff] ring-1 ring-[#0084ff]/40 hover:bg-[#eef6ff]"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {session?.resumeAt || waitingOnAi ? (
        <div className="flex gap-2 border-t bg-white px-3 py-2">
          {session?.resumeAt ? (
            <Button size="sm" variant="outline" onClick={skipWait}>
              <FastForward className="size-3.5" />
              Skip the wait
            </Button>
          ) : null}
          {waitingOnAi ? (
            <Button size="sm" variant="outline" onClick={finishAi}>
              <Sparkles className="size-3.5 text-[#d946ef]" />
              Mark AI goal reached
            </Button>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex gap-2 border-t bg-white p-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim() || lines.length === 0) return;
          send({ text: text.trim() });
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={lines.length === 0}
          placeholder={lines.length ? "Type as the contact…" : "Start the test first"}
          className="min-w-0 flex-1 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1.5 text-[13px] outline-none focus:border-[#0084ff]"
        />
        <Button size="icon" type="submit" aria-label="Send" disabled={!text.trim() || lines.length === 0}>
          <Send className="size-4" />
        </Button>
      </form>

      <footer className="space-y-1 border-t bg-white px-3 py-2 text-[11px] text-[#6b7280]">
        <p>
          <span className="font-medium text-[#1b1f24]">Contact:</span> {contact.firstName} · {contact.email ?? "no email"} ·{" "}
          {contact.phone ?? "no phone"}
        </p>
        {contact.tags.length ? (
          <p>
            <span className="font-medium text-[#1b1f24]">Tags:</span> {contact.tags.join(", ")}
          </p>
        ) : null}
        {visibleFields.length ? (
          <p>
            <span className="font-medium text-[#1b1f24]">Fields:</span> {visibleFields.map(([key, value]) => `${key}=${value}`).join(", ")}
          </p>
        ) : null}
      </footer>
    </aside>
  );
}
