"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { browserLanguage, canListen, canSpeak, listenErrorMessage, listenOnce, Speaker, useVoices, watchForBargeIn } from "@/components/assistant/voice";
import { isBargeIn } from "@/lib/assistant-speech";
import { api } from "@/lib/client";

export type DraftLink = { kind: "flow" | "broadcast"; id: string; name: string; href: string; botName: string };
export type Budget = { limitUsd: number; spentUsd: number; remainingUsd: number; resetsAt: string; exhausted: boolean };
export type ChatMessage = { id: string; role: string; body: string; drafts?: DraftLink[] };
type ServerMessage = { id: string; role: string; body: string; meta?: { drafts?: DraftLink[] } };
export type AssistantState = {
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
  | { type: "navigate"; href: string }
  | { type: "error"; error: string }
  | { type: "done" };
export type Phase = "listening" | "thinking" | "speaking" | "paused";

const VOICE_KEY = "recatch.assistant.voice";
const BARGE_KEY = "recatch.assistant.bargeIn";

let localMessages = 0;
/** Ids for messages not saved yet. */
function localMessageId() {
  localMessages += 1;
  return `local-${localMessages}`;
}

function useAssistantState() {
  const pathname = usePathname();
  const router = useRouter();
  const pathRef = useRef(pathname);
  const [dockOpen, setDockOpen] = useState(false);
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

  const speakerRef = useRef<Speaker | null>(null);
  const listenerRef = useRef<ReturnType<typeof listenOnce> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const voiceOnRef = useRef(false);
  const cycleRef = useRef(0);
  const silenceRef = useRef(0);
  const bargeRef = useRef<ReturnType<typeof watchForBargeIn> | null>(null);
  const [bargeIn, setBargeIn] = useState(true);
  const bargeInRef = useRef(true);
  const hearingTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSupport({ listen: canListen(), speak: canSpeak() });
      setLang(browserLanguage());
      try {
        setVoiceURI(window.localStorage.getItem(VOICE_KEY) ?? "");
        const barge = window.localStorage.getItem(BARGE_KEY) !== "off";
        bargeInRef.current = barge;
        setBargeIn(barge);
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
        body: JSON.stringify({ message, voice: options.voice === true, page: pathRef.current }),
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
        if (event.type === "navigate") router.push(event.href);
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
    await send(message);
  };

  /** One listen → answer → speak round of voice mode. A tap or End starts a new cycle, which stops this one. */
  const showHearing = (words: string) => {
    setHeard(words);
    setHearing(true);
    window.clearTimeout(hearingTimer.current);
    hearingTimer.current = window.setTimeout(() => setHearing(false), 300);
  };

  /** Stop listening for interruptions. Resolves once the browser has let go of the microphone (Chrome won't start a second listener before that), or after a moment regardless. */
  const stopBargeWatch = () => {
    const watch = bargeRef.current;
    bargeRef.current = null;
    if (!watch) return Promise.resolve();
    watch.abort();
    return Promise.race([watch.result.then(() => undefined), new Promise<void>((resolve) => window.setTimeout(resolve, 600))]);
  };

  /** One listen, answer, speak round of voice mode. A tap, an interruption or End starts a new cycle, which stops this one. */
  const listen = async () => {
    if (!voiceOnRef.current) return;
    const cycle = ++cycleRef.current;
    setPhase("listening");
    setHeard("");
    setLive("");
    setVoiceError("");
    const listener = listenOnce(lang, showHearing);
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
    await respond(result.text, cycle);
  };

  /** Answer what they said while listening for them talking over it, then listen again. */
  const respond = async (said: string, cycle: number) => {
    silenceRef.current = 0;
    setPhase("thinking");
    watchBargeIn(cycle);
    const answered = await send(said, { voice: true });
    if (cycle !== cycleRef.current || !voiceOnRef.current) return;
    if (!answered) {
      void stopBargeWatch();
      setPhase("paused");
      return;
    }
    await speakerRef.current?.idle();
    if (cycle !== cycleRef.current || !voiceOnRef.current) return;
    await stopBargeWatch();
    if (cycle === cycleRef.current && voiceOnRef.current) void listen();
  };

  /**
   * While the assistant thinks or speaks, keep an ear open, like ChatGPT and Grok voice: when the
   * person starts talking (not the assistant's own voice through the speakers), drop the rest of the
   * answer and take what they say as the next message.
   */
  const watchBargeIn = (cycle: number) => {
    if (!bargeInRef.current || !voiceOnRef.current || cycle !== cycleRef.current) return;
    let interruptCycle = -1;
    const watch = watchForBargeIn(
      lang,
      (heard) => isBargeIn(heard, speakerRef.current?.recentText ?? ""),
      (heard) => {
        if (cycle !== cycleRef.current) return;
        interruptCycle = ++cycleRef.current;
        requestRef.current?.abort();
        speakerRef.current?.cancel();
        listenerRef.current = watch;
        setPhase("listening");
        setLive("");
        showHearing(heard);
      },
      showHearing,
    );
    bargeRef.current = watch;
    void watch.result.then((result) => {
      if (bargeRef.current === watch) bargeRef.current = null;
      if (listenerRef.current === watch) listenerRef.current = null;
      if (!voiceOnRef.current) return;
      if (watch.interrupted) {
        if (cycleRef.current !== interruptCycle) return;
        if (result.kind === "heard") void respond(result.text, interruptCycle);
        else void listen();
        return;
      }
      // Only echo or quiet so far: keep listening while the answer is still going.
      if (result.kind !== "stopped" && result.kind !== "error" && cycle === cycleRef.current) {
        window.setTimeout(() => watchBargeIn(cycle), 150);
      }
    });
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
    void stopBargeWatch();
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
    const cycle = ++cycleRef.current;
    requestRef.current?.abort();
    speakerRef.current?.cancel();
    silenceRef.current = 0;
    void stopBargeWatch().then(() => {
      if (cycle === cycleRef.current) void listen();
    });
  };

  /** Interrupting by talking can be switched off, for a noisy room or speakers turned up loud. */
  const chooseBargeIn = (on: boolean) => {
    bargeInRef.current = on;
    setBargeIn(on);
    if (!on) void stopBargeWatch();
    try {
      window.localStorage.setItem(BARGE_KEY, on ? "on" : "off");
    } catch {
      // Not remembered this time.
    }
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
    listening: "Listening… pause or tap the circle when you're done",
    thinking: bargeIn ? "Thinking… just talk, or press Space, to interrupt" : "Thinking… tap to stop",
    speaking: bargeIn ? "Speaking… just talk, or press Space, to interrupt" : "Speaking… tap or press Space to interrupt",
    paused: "Paused. Tap the circle or press Space to talk",
  }[phase];

  // Space works like the circle while voice is on, unless someone is typing.
  const tapRef = useRef(tapOrb);
  useEffect(() => {
    tapRef.current = tapOrb;
  });
  useEffect(() => {
    if (!voiceOn) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      event.preventDefault();
      tapRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voiceOn]);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  return {
    state,
    messages,
    text,
    setText,
    status,
    busy,
    error,
    support,
    voiceOn,
    phase,
    phaseLabel,
    heard,
    hearing,
    voiceError,
    voices,
    voice,
    reading,
    live,
    exhausted,
    ready,
    streamingId,
    send,
    submit,
    startVoice,
    endVoice,
    tapOrb,
    readAloud,
    newChat,
    chooseVoice,
    bargeIn,
    chooseBargeIn,
    dockOpen,
    setDockOpen,
  };
}

export type AssistantApi = ReturnType<typeof useAssistantState>;

const AssistantContext = createContext<AssistantApi | null>(null);

/**
 * One assistant for the whole console. It sits in the console layout, which stays mounted while
 * people move between pages, so a conversation (and a voice session) carries on from page to page.
 * The Overview card and the dock on every other page are two views of the same state.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const assistant = useAssistantState();
  return <AssistantContext.Provider value={assistant}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const assistant = useContext(AssistantContext);
  if (!assistant) throw new Error("useAssistant needs AssistantProvider");
  return assistant;
}
