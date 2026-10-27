"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUp, Loader2, Mic, Minus, Sparkles, Square, SquarePen, Volume2, X } from "lucide-react";
import { useAssistant, type AssistantState, type Budget, type DraftLink, type Phase } from "@/components/assistant/assistant-context";
import { CanvasCard } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { speakableText } from "@/lib/assistant-speech";
import { cn } from "@/lib/utils";

const GRADIENT = "radial-gradient(circle at 30% 25%, #9fd0ff 0%, #0084ff 42%, #8b5cf6 72%, #d946ef 100%)";

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;


/** Links and bold inside one line. Recatch paths open in the app; https links open in a new tab. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const [whole, label, href, bold] = match;
    if (label && href) {
      if (href.startsWith("/") && !href.startsWith("//")) {
        out.push(
          <Link key={`${key}-${index}`} href={href} className="font-medium text-[#0084ff] hover:underline">
            {label}
          </Link>,
        );
      } else if (/^https:\/\//i.test(href)) {
        out.push(
          <a key={`${key}-${index}`} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0084ff] hover:underline">
            {label}
          </a>,
        );
      } else {
        out.push(label);
      }
    } else if (bold) {
      out.push(
        <strong key={`${key}-${index}`} className="font-semibold">
          {bold}
        </strong>,
      );
    }
    last = index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+/;

/** The little markdown the assistant writes: paragraphs, lists, links and bold. Everything else stays text. */
function MessageText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split(/\n{2,}/).map((block, blockIndex) => {
        const lines = block.split("\n").filter((line) => line.trim());
        if (lines.length > 0 && lines.every((line) => LIST_ITEM.test(line))) {
          const ordered = /^\s*\d/.test(lines[0]!);
          const items = lines.map((line, itemIndex) => <li key={itemIndex}>{inline(line.replace(LIST_ITEM, ""), `${blockIndex}-${itemIndex}`)}</li>);
          return ordered ? (
            <ol key={blockIndex} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={blockIndex} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={blockIndex} className="whitespace-pre-wrap">
            {inline(block, String(blockIndex))}
          </p>
        );
      })}
    </div>
  );
}

function DraftChips({ drafts }: { drafts?: DraftLink[] }) {
  if (!drafts?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {drafts.map((draft) => (
        <Link
          key={draft.id}
          href={draft.href}
          className="rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-[#0084ff] ring-1 ring-[#d6e6ff] hover:bg-[#f4f8ff]"
        >
          Open {draft.kind === "flow" ? "draft flow" : "broadcast draft"} · {draft.name}
        </Link>
      ))}
    </div>
  );
}

function resetLabel(resetsAt: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(resetsAt));
}

function AllowanceChip({ billing, ownKey, budget }: { billing: AssistantState["billing"]; ownKey: string | null; budget: Budget | null }) {
  if (billing === "own") {
    return <span className="rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] text-[#6b7280] ring-1 ring-[#e5e7eb]">On your {ownKey ?? "own"} key</span>;
  }
  if (!budget) return null;
  const used = budget.limitUsd > 0 ? Math.min(1, budget.spentUsd / budget.limitUsd) : 1;
  return (
    <span
      className="flex items-center gap-2 rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] text-[#6b7280] ring-1 ring-[#e5e7eb]"
      title={`$${budget.spentUsd.toFixed(2)} of $${budget.limitUsd.toFixed(2)} used this month. Starts over on ${resetLabel(budget.resetsAt)}.`}
    >
      <span className="block h-1.5 w-12 overflow-hidden rounded-full bg-[#e5e7eb]" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${Math.round(used * 100)}%`, background: used >= 0.85 ? "#f59e0b" : "#00c853" }} />
      </span>
      ${budget.remainingUsd.toFixed(2)} left this month
    </span>
  );
}

function Orb({ phase, hearing }: { phase: Phase; hearing: boolean }) {
  return (
    <span className="relative grid size-28 place-items-center">
      {phase === "listening" || phase === "speaking" ? (
        <span className="absolute inset-0 animate-ping rounded-full opacity-25" style={{ background: GRADIENT, animationDuration: phase === "speaking" ? "1.2s" : "2s" }} />
      ) : null}
      <span
        className={cn("relative block size-24 rounded-full shadow-[0_10px_40px_rgba(0,132,255,0.35)] transition-transform duration-200", phase === "thinking" && "animate-pulse", phase === "paused" && "opacity-60 saturate-50")}
        style={{ background: GRADIENT, transform: phase === "listening" && hearing ? "scale(1.12)" : "scale(1)" }}
      />
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Writing">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="size-1.5 animate-bounce rounded-full bg-[#9aa4b2]" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}


/** The conversation, voice stage and composer, shared by the Overview card and the dock. */
function AssistantBody({ fill }: { fill?: boolean }) {
  const a = useAssistant();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { state, messages, status } = a;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, status]);

  const submit = () => {
    if (inputRef.current) inputRef.current.style.height = "auto";
    void a.submit();
  };

  if (state && !state.configured) {
    return (
      <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-[13px] text-[#1b1f24] ring-1 ring-[#e5e7eb]">
        The assistant isn&apos;t switched on for this workspace yet. Saving your own AI key (Anthropic, OpenAI, OpenRouter and others) on the{" "}
        <Link href="/ai" className="font-medium text-[#0084ff] hover:underline">
          AI assistant
        </Link>{" "}
        page turns it on now.
      </p>
    );
  }

  if (a.voiceOn) {
    return (
      <div className={cn("flex flex-col items-center gap-3 rounded-xl bg-gradient-to-b from-[#f4f8ff] to-white px-4 py-6 ring-1 ring-[#e5eefc]", fill && "flex-1 justify-center")}>
        <button
          type="button"
          onClick={a.tapOrb}
          aria-label={a.phase === "listening" ? "Done talking" : a.phase === "paused" ? "Start talking" : "Interrupt and talk"}
          className="rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[#0084ff]/30"
        >
          <Orb phase={a.phase} hearing={a.hearing} />
        </button>
        <p aria-live="polite" className="text-center text-[13px] font-medium text-[#1b1f24]">
          {a.phaseLabel}
        </p>
        {a.heard ? <p className="max-w-md text-center text-[13px] text-[#6b7280]">“{a.heard}”</p> : null}
        {a.live ? <p className="line-clamp-4 max-w-md text-center text-[13px] text-[#1b1f24]">{speakableText(a.live)}</p> : null}
        {status && a.phase === "thinking" ? <p className="text-[12px] text-[#6b7280]">{status}</p> : null}
        {a.voiceError ? <p className="max-w-md text-center text-[12px] text-red-600">{a.voiceError}</p> : null}
        {a.voiceNote ? <p className="max-w-md text-center text-[12px] text-[#6b7280]">{a.voiceNote}</p> : null}
        {a.naturalState.status === "loading" && a.voiceChoice.startsWith("natural:") ? (
          <p className="max-w-md text-center text-[12px] text-[#6b7280]">
            Downloading the natural voice ({Math.round(a.naturalState.progress * 100)}%). It happens once, and the browser&apos;s voice speaks until it&apos;s ready.
          </p>
        ) : null}
        {!a.support.speak && a.naturalVoices.length === 0 ? <p className="text-[12px] text-[#6b7280]">This browser can&apos;t speak, so answers show as text.</p> : null}
        <p className="max-w-xs text-center text-[11px] text-[#8b95a1]">Keep talking while you move around Recatch. Ask it to open a page and it will.</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {a.naturalVoices.length > 0 || a.voices.length > 1 ? (
            <select
              value={a.voiceChoice}
              onChange={(event) => a.chooseVoice(event.target.value)}
              aria-label="Assistant voice"
              className="max-w-56 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-[12px] text-[#1b1f24]"
            >
              {a.naturalVoices.length > 0 ? (
                <optgroup label={a.naturalLabel}>
                  {a.naturalVoices.map((item) => (
                    <option key={item.id} value={`natural:${item.id}`}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {a.voices.length > 0 ? (
                <optgroup label="This browser's voices">
                  {a.voices.map((item) => (
                    <option key={item.voiceURI} value={item.voiceURI}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          ) : null}
          <Button variant="outline" size="sm" onClick={a.endVoice}>
            <X />
            End voice
          </Button>
        </div>
        {a.error ? <p className="text-center text-[12px] text-red-600">{a.error}</p> : null}
      </div>
    );
  }

  return (
    <>
      {messages.length === 0 ? (
        <div className={cn("rounded-xl bg-[#f8fafc] p-3", fill && "flex-1")}>
          <p className="text-[13px] text-[#1b1f24]">
            {state?.firstName ? `Hi ${state.firstName}! ` : "Hi! "}What should we work on? You can type, or press Talk and just say it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(state?.suggestions ?? []).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={!a.ready || a.busy}
                onClick={() => void a.send(suggestion)}
                className="rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-[#1b1f24] ring-1 ring-[#e5e7eb] hover:ring-[#0084ff] disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={listRef} className={cn("space-y-3 overflow-y-auto rounded-xl bg-[#f8fafc] p-3", fill ? "min-h-0 flex-1" : "max-h-[22rem]")}>
          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#1b1f24] px-3 py-2 text-[13px] whitespace-pre-wrap text-white">{message.body}</p>
              </div>
            ) : (
              <div key={message.id} className="flex gap-2">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white" style={{ background: GRADIENT }}>
                  <Sparkles className="size-3" />
                </span>
                <div className="min-w-0 max-w-[85%]">
                  <div className="rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[13px] text-[#1b1f24] ring-1 ring-[#e5e7eb]">
                    {message.body ? <MessageText text={message.body} /> : <TypingDots />}
                  </div>
                  <DraftChips drafts={message.drafts} />
                  {message.body && (a.support.speak || a.naturalVoices.length > 0) && message.id !== a.streamingId ? (
                    <button
                      type="button"
                      onClick={() => a.readAloud(message)}
                      className="mt-1 flex items-center gap-1 text-[11px] text-[#8b95a1] hover:text-[#1b1f24]"
                    >
                      {a.reading === message.id ? <Square className="size-3" /> : <Volume2 className="size-3" />}
                      {a.reading === message.id ? "Stop" : "Listen"}
                    </button>
                  ) : null}
                </div>
              </div>
            ),
          )}
          {status ? (
            <p className="flex items-center gap-1.5 pl-8 text-[12px] text-[#6b7280]">
              <Loader2 className="size-3 animate-spin" />
              {status}
            </p>
          ) : null}
        </div>
      )}

      {a.exhausted && state?.budget ? (
        <p className="rounded-xl bg-[#fff8eb] px-3 py-2 text-[13px] text-[#1b1f24] ring-1 ring-[#fde7b0]">
          You&apos;ve used this month&apos;s ${state.budget.limitUsd.toFixed(2)} assistant allowance. It comes back on {resetLabel(state.budget.resetsAt)}, or save your own AI key on the{" "}
          <Link href="/ai" className="font-medium text-[#0084ff] hover:underline">
            AI assistant
          </Link>{" "}
          page to keep going now.
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 rounded-2xl bg-white p-1.5 ring-1 ring-[#e5e7eb] focus-within:ring-[#0084ff]"
      >
        <textarea
          ref={inputRef}
          value={a.text}
          rows={1}
          onChange={(event) => {
            a.setText(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything, or describe the funnel you want…"
          aria-label="Message the assistant"
          disabled={!a.ready || a.busy}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-[13px] outline-none placeholder:text-[#8b95a1] disabled:opacity-60"
        />
        <Button
          type="button"
          variant="outline"
          onClick={a.startVoice}
          disabled={!a.ready || a.busy || !a.support.listen}
          title={a.support.listen ? "Talk to the assistant" : "Talking needs Chrome, Edge or Safari"}
        >
          <Mic />
          Talk
        </Button>
        <Button type="submit" size="icon" disabled={!a.ready || a.busy || !a.text.trim()} aria-label="Send">
          {a.busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
      {a.error ? <p className="text-[12px] text-red-600">{a.error}</p> : null}
    </>
  );
}

function AssistantActions() {
  const a = useAssistant();
  return (
    <>
      {a.state?.configured ? <AllowanceChip billing={a.state.billing} ownKey={a.state.ownKey} budget={a.state.budget} /> : null}
      {a.messages.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => void a.newChat()} disabled={a.busy}>
          <SquarePen />
          New chat
        </Button>
      ) : null}
    </>
  );
}

/**
 * The assistant as a card at the top of Overview. Leaving Overview mid-conversation opens the dock,
 * so the conversation carries on on the next page.
 */
export function AssistantPanel() {
  const { voiceOn, busy, setDockOpen } = useAssistant();
  const active = useRef(false);
  useEffect(() => {
    active.current = voiceOn || busy;
  }, [voiceOn, busy]);
  useEffect(
    () => () => {
      if (active.current) setDockOpen(true);
    },
    [setDockOpen],
  );

  return (
    <CanvasCard className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full text-white shadow-sm" style={{ background: GRADIENT }}>
            <Sparkles className="size-4" />
          </span>
          <div>
            <h2 className="font-heading text-[15px] text-[#1b1f24]">Recatch Assistant</h2>
            <p className="max-w-xl text-[12px] text-[#6b7280]">
              Talk or type. It walks you through setup, builds funnels as drafts for you to switch on, and answers questions about your numbers. It stays with you on every page.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssistantActions />
        </div>
      </div>
      <AssistantBody />
    </CanvasCard>
  );
}

/**
 * The assistant on every page but Overview: a button in the corner that opens a panel beside the page.
 * The page stays usable, so someone can look through Flows while still talking.
 */
export function AssistantDock() {
  const a = useAssistant();
  const pathname = usePathname();
  if (pathname === "/") return null;
  // Live Chat and the flow editor keep their own controls along the bottom.
  const raised = pathname.startsWith("/inbox") || /^\/flows\/[^/]+$/.test(pathname);

  if (!a.dockOpen) {
    return (
      <button
        type="button"
        onClick={() => a.setDockOpen(true)}
        className={cn(
          "fixed right-4 z-40 flex items-center gap-2 rounded-full bg-white py-1.5 pr-3.5 pl-1.5 text-[13px] font-medium text-[#1b1f24] shadow-[0_8px_30px_rgba(16,24,40,0.18)] ring-1 ring-[#e5e7eb] hover:ring-[#0084ff]",
          raised ? "bottom-24" : "bottom-4",
        )}
        aria-label="Open the Recatch Assistant"
      >
        <span className={cn("grid size-8 place-items-center rounded-full text-white", a.voiceOn && "animate-pulse")} style={{ background: GRADIENT }}>
          {a.voiceOn ? <Mic className="size-4" /> : <Sparkles className="size-4" />}
        </span>
        {a.voiceOn ? (a.phase === "speaking" ? "Speaking…" : a.phase === "thinking" ? "Thinking…" : a.phase === "listening" ? "Listening…" : "Voice paused") : "Ask Recatch"}
      </button>
    );
  }

  return (
    <section
      aria-label="Recatch Assistant"
      className="fixed inset-x-2 top-16 bottom-2 z-40 flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-[0_12px_48px_rgba(16,24,40,0.22)] ring-1 ring-[#e5e7eb] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[400px] md:top-20"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: GRADIENT }}>
            <Sparkles className="size-3.5" />
          </span>
          <h2 className="truncate font-heading text-[14px] text-[#1b1f24]">Recatch Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          <AssistantActions />
          <Button variant="ghost" size="icon" onClick={() => a.setDockOpen(false)} aria-label={a.voiceOn ? "Minimize, voice keeps going" : "Minimize the assistant"}>
            <Minus />
          </Button>
        </div>
      </div>
      <AssistantBody fill />
    </section>
  );
}
