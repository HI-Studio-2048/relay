"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { browserLanguage, canListen, canSpeak, listenErrorMessage, listenOnce, Speaker, useVoices } from "@/components/assistant/voice";
import { DEFAULT_NATURAL_VOICE, isNaturalVoice, NATURAL_VOICES } from "@/lib/assistant-speech";
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
  /** The server can speak in a natural voice (an OpenAI key, the account's or the company's). */
  naturalVoice: boolean;
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

/** The chosen voice: "natural:<id>" for a server voice, or a browser voice's voiceURI. */
const VOICE_KEY = "recatch.assistant.voice";
const NATURAL_PREFIX = "natural:";

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
  const [voiceNote, setVoiceNote] = useState("");
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
    const speaker = new Speaker(
      lang,
      (speaking) => {
        if (speaking && voiceOnRef.current) setPhase("speaking");
        if (!speaking) setReading(null);
      },
      setVoiceNote,
    );
    speakerRef.current = speaker;
    return () => speaker.cancel();
  }, [lang]);

  const voice = voices.find((item) => item.voiceURI === voiceURI) ?? voices[0] ?? null;
  // A natural voice when the server has one, unless a browser voice was picked on purpose.
  const chosenNatural = voiceURI.startsWith(NATURAL_PREFIX) ? voiceURI.slice(NATURAL_PREFIX.length) : "";
  const naturalVoice =
    state?.naturalVoice !== true ? null : isNaturalVoice(chosenNatural) ? chosenNatural : voiceURI && !chosenNatural ? null : DEFAULT_NATURAL_VOICE;
  const naturalVoices = state?.naturalVoice === true ? NATURAL_VOICES : [];
  const voiceChoice = naturalVoice ? `${NATURAL_PREFIX}${naturalVoice}` : (voice?.voiceURI ?? "");
  useEffect(() => {
    if (speakerRef.current) speakerRef.current.voice = voice;
  }, [voice]);
  useEffect(() => {
    speakerRef.current?.setNatural(naturalVoice);
    setVoiceNote("");
  }, [naturalVoice, lang]);

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
    // Picking again gives the natural voice another try after it fell back.
    speakerRef.current?.setNatural(uri.startsWith(NATURAL_PREFIX) && state?.naturalVoice === true ? uri.slice(NATURAL_PREFIX.length) : null);
    setVoiceNote("");
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
    voiceNote,
    voices,
    voice,
    naturalVoices,
    voiceChoice,
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
