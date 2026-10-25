"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Loader2, Mic, Sparkles, Square, SquarePen, Volume2, X } from "lucide-react";
import { CanvasCard } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { browserLanguage, canListen, canSpeak, listenErrorMessage, listenOnce, Speaker, useVoices } from "@/components/assistant/voice";
import { speakableText } from "@/lib/assistant-speech";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

type DraftLink = { kind: "flow" | "broadcast"; id: string; name: string; href: string; botName: string };
type Budget = { limitUsd: number; spentUsd: number; remainingUsd: number; resetsAt: string; exhausted: boolean };
type ChatMessage = { id: string; role: string; body: string; drafts?: DraftLink[] };
type ServerMessage = { id: string; role: string; body: string; meta?: { drafts?: DraftLink[] } };
type AssistantState = {
  configured: boolean;
  billing: "server" | "own";
  /** The provider of the account's own key, like "Anthropic", when billing is "own". */
  ownKey: string | null;
  budget: Budget | null;
  suggestions: string[];
  firstName: string;
  messages: ServerMessage[];
};
type StreamEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "draft"; draft: DraftLink }
  | { type: "budget"; budget: Budget }
  | { type: "error"; error: string }
  | { type: "done" };
type Phase = "listening" | "thinking" | "speaking" | "paused";

const GRADIENT = "radial-gradient(circle at 30% 25%, #9fd0ff 0%, #0084ff 42%, #8b5cf6 72%, #d946ef 100%)";
const VOICE_KEY = "recatch.assistant.voice";

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

let localMessages = 0;
/** Ids for messages not saved yet. */
function localMessageId() {
  localMessages += 1;
  return `local-${localMessages}`;
}

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

/**
 * The Overview assistant, for every login: chat or talk (voice in and out through the browser), with
 * drafts it saves linked under its answers. It runs on the account's own AI key when one is saved,
 * otherwise on the company's Claude key within a monthly allowance the chip shows.
 */
export function AssistantPanel() {
  const [state, setState] = useState<AssistantState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [support, setSupport] = useState({ listen: false, speak: false });
  const [lang, setLang] = useState("en-US");
  const [voiceOn, setVoiceOn] = useState(false);
  const [phase, setPhase] = useState<Phase>("paused");
  const [heard, setHeard] = useState("");
  const [hearing, setHearing] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceURI, setVoiceURI] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const voices = useVoices(lang);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const listenerRef = useRef<ReturnType<typeof listenOnce> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const voiceOnRef = useRef(false);
  const cycleRef = useRef(0);
  const silenceRef = useRef(0);
  const hearingTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSupport({ listen: canListen(), speak: canSpeak() });
      setLang(browserLanguage());
      try {
        setVoiceURI(window.localStorage.getItem(VOICE_KEY) ?? "");
      } catch {
        // Storage can be blocked; the best voice is picked instead.
      }
      void api<AssistantState>("/api/agent")
        .then((data) => {
          setState(data);
          setMessages(data.messages.map((message) => ({ id: message.id, role: message.role, body: message.body, drafts: message.meta?.drafts })));
        })
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the assistant"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const speaker = new Speaker(lang, (speaking) => {
      if (speaking && voiceOnRef.current) setPhase("speaking");
      if (!speaking) setReading(null);
    });
    speakerRef.current = speaker;
    return () => speaker.cancel();
  }, [lang]);

  const voice = voices.find((item) => item.voiceURI === voiceURI) ?? voices[0] ?? null;
  useEffect(() => {
    if (speakerRef.current) speakerRef.current.voice = voice;
  }, [voice]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, status]);

  useEffect(
    () => () => {
      voiceOnRef.current = false;
      requestRef.current?.abort();
      listenerRef.current?.abort();
      window.clearTimeout(hearingTimer.current);
    },
    [],
  );

  const exhausted = state?.billing === "server" && Boolean(state.budget?.exhausted);
  const streamingId = busy ? messages[messages.length - 1]?.id : undefined;
  const ready = state?.configured === true && !exhausted;

  /** Send one message and stream the answer in. Resolves true when an answer arrived. */
  const send = async (message: string, options: { voice?: boolean } = {}) => {
    if (!message || busy || !ready) return false;
    setError("");
    setBusy(true);
    setStatus("Thinking…");
    const localId = localMessageId();
    const replyId = `${localId}-reply`;
    setMessages((current) => [...current, { id: localId, role: "user", body: message }, { id: replyId, role: "assistant", body: "" }]);
    const request = new AbortController();
    requestRef.current = request;
    let accepted = false;
    let answered = false;
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, voice: options.voice === true }),
        signal: request.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; budget?: Budget };
        if (data.budget) setState((current) => (current ? { ...current, budget: data.budget! } : current));
        throw new Error(data.error || "The assistant could not answer");
      }
      accepted = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const apply = (event: StreamEvent) => {
        if (event.type === "status") setStatus(event.text);
        if (event.type === "delta") {
          answered = true;
          setStatus("");
          if (options.voice) {
            speakerRef.current?.feed(event.text);
            setLive((current) => current + event.text);
          }
          setMessages((current) => current.map((item) => (item.id === replyId ? { ...item, body: item.body + event.text } : item)));
        }
        if (event.type === "draft") {
          setMessages((current) => current.map((item) => (item.id === replyId ? { ...item, drafts: [...(item.drafts ?? []), event.draft] } : item)));
        }
        if (event.type === "budget") setState((current) => (current ? { ...current, budget: event.budget } : current));
        if (event.type === "error") throw new Error(event.error);
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((item) => item.startsWith("data: "));
          if (line) apply(JSON.parse(line.slice(6)) as StreamEvent);
        }
      }
      if (options.voice) speakerRef.current?.flush();
      return answered;
    } catch (reason) {
      const stopped = reason instanceof DOMException && reason.name === "AbortError";
      if (!stopped) setError(reason instanceof Error ? reason.message : "The assistant could not answer");
      if (accepted) {
        // The question was saved; only drop an empty answer bubble.
        setMessages((current) => current.filter((item) => item.id !== replyId || item.body));
      } else {
        // Refused before anything was saved (limit, allowance, not set up): take it back out.
        setMessages((current) => current.filter((item) => item.id !== localId && item.id !== replyId));
        if (!options.voice && !stopped) setText(message);
      }
      return false;
    } finally {
      if (requestRef.current === request) requestRef.current = null;
      setBusy(false);
      setStatus("");
    }
  };

  const submit = async () => {
    const message = text.trim();
    if (!message) return;
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    await send(message);
  };

  /** One listen → answer → speak round of voice mode. A tap or End starts a new cycle, which stops this one. */
  const listen = async () => {
    if (!voiceOnRef.current) return;
    const cycle = ++cycleRef.current;
    setPhase("listening");
    setHeard("");
    setLive("");
    setVoiceError("");
    const listener = listenOnce(lang, (words) => {
      setHeard(words);
      setHearing(true);
      window.clearTimeout(hearingTimer.current);
      hearingTimer.current = window.setTimeout(() => setHearing(false), 300);
    });
    listenerRef.current = listener;
    const result = await listener.result;
    if (listenerRef.current === listener) listenerRef.current = null;
    if (cycle !== cycleRef.current || !voiceOnRef.current) return;
    if (result.kind === "silence") {
      silenceRef.current += 1;
      if (silenceRef.current < 2) void listen();
      else setPhase("paused");
      return;
    }
    if (result.kind === "error") {
      setVoiceError(listenErrorMessage(result.error));
      setPhase("paused");
      return;
    }
    if (result.kind !== "heard") return;
    silenceRef.current = 0;
    setPhase("thinking");
    const answered = await send(result.text, { voice: true });
    if (cycle !== cycleRef.current || !voiceOnRef.current) return;
    if (!answered) {
      setPhase("paused");
      return;
    }
    await speakerRef.current?.idle();
    if (cycle === cycleRef.current && voiceOnRef.current) void listen();
  };

  const startVoice = () => {
    if (!support.listen || !ready) return;
    // Chrome can drop the next sentence after a cancel, so only cancel what is actually playing.
    if (speakerRef.current?.speaking) speakerRef.current.cancel();
    speakerRef.current?.unlock();
    voiceOnRef.current = true;
    silenceRef.current = 0;
    setVoiceOn(true);
    setReading(null);
    void listen();
  };

  const endVoice = () => {
    voiceOnRef.current = false;
    cycleRef.current += 1;
    listenerRef.current?.abort();
    listenerRef.current = null;
    requestRef.current?.abort();
    speakerRef.current?.cancel();
    setVoiceOn(false);
    setPhase("paused");
    setHeard("");
    setLive("");
    setVoiceError("");
  };

  /** The circle: send what was heard, interrupt the answer, or start listening again. */
  const tapOrb = () => {
    if (phase === "listening") {
      listenerRef.current?.stop();
      return;
    }
    cycleRef.current += 1;
    requestRef.current?.abort();
    speakerRef.current?.cancel();
    silenceRef.current = 0;
    void listen();
  };

  const readAloud = (message: ChatMessage) => {
    const speaker = speakerRef.current;
    if (!speaker) return;
    if (reading === message.id) {
      speaker.cancel();
      setReading(null);
      return;
    }
    if (speaker.speaking) speaker.cancel();
    speaker.unlock();
    setReading(message.id);
    speaker.feed(message.body);
    speaker.flush();
  };

  const newChat = async () => {
    endVoice();
    setError("");
    try {
      await api("/api/agent", { method: "DELETE" });
      setMessages([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start a new chat");
    }
  };

  const chooseVoice = (uri: string) => {
    setVoiceURI(uri);
    try {
      window.localStorage.setItem(VOICE_KEY, uri);
    } catch {
      // Not remembered this time.
    }
  };

  const phaseLabel = {
    listening: "Listening… tap the circle when you're done",
    thinking: "Thinking… tap to stop",
    speaking: "Speaking… tap to interrupt",
    paused: "Paused. Tap the circle to talk",
  }[phase];

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
              Talk or type. It walks you through setup, builds funnels as drafts for you to switch on, and answers questions about your numbers.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state?.configured ? <AllowanceChip billing={state.billing} ownKey={state.ownKey} budget={state.budget} /> : null}
          {messages.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => void newChat()} disabled={busy}>
              <SquarePen />
              New chat
            </Button>
          ) : null}
        </div>
      </div>

      {state && !state.configured ? (
        <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-[13px] text-[#1b1f24] ring-1 ring-[#e5e7eb]">
          The assistant isn&apos;t switched on for this workspace yet. Saving your own AI key (Anthropic, OpenAI, OpenRouter and others) on the{" "}
          <Link href="/ai" className="font-medium text-[#0084ff] hover:underline">
            AI assistant
          </Link>{" "}
          page turns it on now.
        </p>
      ) : voiceOn ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-gradient-to-b from-[#f4f8ff] to-white px-4 py-6 ring-1 ring-[#e5eefc]">
          <button
            type="button"
            onClick={tapOrb}
            aria-label={phase === "listening" ? "Done talking" : phase === "paused" ? "Start talking" : "Interrupt and talk"}
            className="rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[#0084ff]/30"
          >
            <Orb phase={phase} hearing={hearing} />
          </button>
          <p aria-live="polite" className="text-[13px] font-medium text-[#1b1f24]">
            {phaseLabel}
          </p>
          {heard ? <p className="max-w-md text-center text-[13px] text-[#6b7280]">“{heard}”</p> : null}
          {live ? <p className="line-clamp-4 max-w-md text-center text-[13px] text-[#1b1f24]">{speakableText(live)}</p> : null}
          {status && phase === "thinking" ? <p className="text-[12px] text-[#6b7280]">{status}</p> : null}
          {voiceError ? <p className="max-w-md text-center text-[12px] text-red-600">{voiceError}</p> : null}
          {!support.speak ? <p className="text-[12px] text-[#6b7280]">This browser can&apos;t speak, so answers show as text.</p> : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {voices.length > 1 ? (
              <select
                value={voice?.voiceURI ?? ""}
                onChange={(event) => chooseVoice(event.target.value)}
                aria-label="Assistant voice"
                className="max-w-56 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-[12px] text-[#1b1f24]"
              >
                {voices.map((item) => (
                  <option key={item.voiceURI} value={item.voiceURI}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button variant="outline" size="sm" onClick={endVoice}>
              <X />
              End voice
            </Button>
          </div>
        </div>
      ) : (
        <>
          {messages.length === 0 ? (
            <div className="rounded-xl bg-[#f8fafc] p-3">
              <p className="text-[13px] text-[#1b1f24]">
                {state?.firstName ? `Hi ${state.firstName}! ` : "Hi! "}What should we work on? You can type, or press Talk and just say it.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(state?.suggestions ?? []).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={!ready || busy}
                    onClick={() => void send(suggestion)}
                    className="rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-[#1b1f24] ring-1 ring-[#e5e7eb] hover:ring-[#0084ff] disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div ref={listRef} className="max-h-[22rem] space-y-3 overflow-y-auto rounded-xl bg-[#f8fafc] p-3">
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
                      {message.body && support.speak && message.id !== streamingId ? (
                        <button
                          type="button"
                          onClick={() => readAloud(message)}
                          className="mt-1 flex items-center gap-1 text-[11px] text-[#8b95a1] hover:text-[#1b1f24]"
                        >
                          {reading === message.id ? <Square className="size-3" /> : <Volume2 className="size-3" />}
                          {reading === message.id ? "Stop" : "Listen"}
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

          {exhausted && state?.budget ? (
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
              void submit();
            }}
            className="flex items-end gap-2 rounded-2xl bg-white p-1.5 ring-1 ring-[#e5e7eb] focus-within:ring-[#0084ff]"
          >
            <textarea
              ref={inputRef}
              value={text}
              rows={1}
              onChange={(event) => {
                setText(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask anything, or describe the funnel you want…"
              aria-label="Message the assistant"
              disabled={!ready || busy}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-[13px] outline-none placeholder:text-[#8b95a1] disabled:opacity-60"
            />
            <Button
              type="button"
              variant="outline"
              onClick={startVoice}
              disabled={!ready || busy || !support.listen}
              title={support.listen ? "Talk to the assistant" : "Talking needs Chrome, Edge or Safari"}
            >
              <Mic />
              Talk
            </Button>
            <Button type="submit" size="icon" disabled={!ready || busy || !text.trim()} aria-label="Send">
              {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </form>
          {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
        </>
      )}
      {voiceOn && error ? <p className="text-center text-[12px] text-red-600">{error}</p> : null}
    </CanvasCard>
  );
}
