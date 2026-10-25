"use client";

import { useEffect, useState } from "react";
import { rankVoices, takeSentences } from "@/lib/assistant-speech";

/**
 * The browser's own speech: SpeechRecognition to hear the person (Chrome, Edge and Safari; not Firefox)
 * and speechSynthesis to answer out loud. Nothing here costs anything or leaves the browser except
 * what the browser itself sends to its speech service.
 */

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; length: number; [index: number]: RecognitionAlternative | undefined };
type RecognitionEvent = { resultIndex: number; results: { length: number; [index: number]: RecognitionResult | undefined } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function canListen() {
  return recognitionConstructor() !== null;
}

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function browserLanguage() {
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
}

export type ListenResult =
  | { kind: "heard"; text: string }
  | { kind: "silence" }
  | { kind: "stopped" }
  | { kind: "error"; error: string };

/** Why listening failed, in words someone can act on. */
export function listenErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") return "The microphone is blocked. Allow it for this site in your browser, then tap the circle.";
  if (error === "audio-capture") return "No microphone was found.";
  if (error === "network") return "Voice needs an internet connection to understand you.";
  if (error === "language-not-supported") return "Your browser can't understand speech in this language.";
  if (error === "unsupported") return "Talking to the assistant needs Chrome, Edge or Safari.";
  return "Something went wrong with the microphone. Tap the circle to try again.";
}

/**
 * Listen for one thing said. Resolves when the person pauses. `stop` keeps what was heard so far;
 * `abort` throws it away.
 */
export function listenOnce(lang: string, onHearing: (text: string) => void) {
  const Constructor = recognitionConstructor();
  if (!Constructor) {
    return { result: Promise.resolve<ListenResult>({ kind: "error", error: "unsupported" }), stop() {}, abort() {} };
  }
  const recognition = new Constructor();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let heard = "";
  let partial = "";
  let failure = "";
  let aborted = false;
  const result = new Promise<ListenResult>((resolve) => {
    recognition.onresult = (event) => {
      partial = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const item = event.results[index];
        const text = item?.[0]?.transcript ?? "";
        if (item?.isFinal) heard += text;
        else partial += text;
      }
      onHearing(`${heard}${partial}`.trim());
    };
    recognition.onerror = (event) => {
      failure = event.error;
    };
    recognition.onend = () => {
      const text = `${heard}${partial}`.trim();
      if (aborted) resolve({ kind: "stopped" });
      else if (text) resolve({ kind: "heard", text });
      else if (failure && failure !== "no-speech" && failure !== "aborted") resolve({ kind: "error", error: failure });
      else resolve({ kind: "silence" });
    };
  });
  try {
    recognition.start();
  } catch {
    return { result: Promise.resolve<ListenResult>({ kind: "error", error: "start" }), stop() {}, abort() {} };
  }
  return {
    result,
    stop: () => recognition.stop(),
    abort: () => {
      aborted = true;
      recognition.abort();
    },
  };
}

/**
 * Speaks streamed text sentence by sentence, so the answer starts while it is still being written.
 * `idle()` resolves once everything queued has been said or cancelled.
 */
export class Speaker {
  private pending = 0;
  private buffer = "";
  private generation = 0;
  private waiters: (() => void)[] = [];
  private said: string[] = [];
  voice: SpeechSynthesisVoice | null = null;

  constructor(
    private readonly lang: string,
    private readonly onSpeaking: (speaking: boolean) => void,
  ) {}

  /** iOS only speaks after a tap, so call this from the tap that turns voice on. */
  unlock() {
    if (!canSpeak()) return;
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }

  feed(delta: string) {
    this.buffer += delta;
    const { sentences, rest } = takeSentences(this.buffer);
    this.buffer = rest;
    for (const sentence of sentences) this.say(sentence);
  }

  /** The reply is complete: say whatever is left. */
  flush() {
    const { sentences } = takeSentences(this.buffer, true);
    this.buffer = "";
    for (const sentence of sentences) this.say(sentence);
    this.settle();
  }

  cancel() {
    this.generation += 1;
    this.buffer = "";
    this.pending = 0;
    if (canSpeak()) window.speechSynthesis.cancel();
    this.settle();
  }

  get speaking() {
    return this.pending > 0;
  }

  /** The last few sentences queued or spoken, so the microphone can tell its own echo from the person. */
  get recentText() {
    return this.said.join(" ");
  }

  idle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private say(text: string) {
    if (!canSpeak()) return;
    this.said = [...this.said.slice(-5), text];
    const generation = this.generation;
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utterance.voice = this.voice;
      utterance.lang = this.voice.lang;
    } else {
      utterance.lang = this.lang;
    }
    utterance.rate = 1.03;
    let finished = false;
    // Some browsers drop the end event now and then; never wait longer than the sentence could take.
    const watchdog = window.setTimeout(() => done(), 4000 + text.length * 110);
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(watchdog);
      if (generation !== this.generation) return;
      this.pending = Math.max(0, this.pending - 1);
      this.settle();
    };
    utterance.onend = done;
    utterance.onerror = done;
    if (this.pending === 0) this.onSpeaking(true);
    this.pending += 1;
    window.speechSynthesis.speak(utterance);
  }

  private settle() {
    if (this.pending > 0) return;
    this.onSpeaking(false);
    for (const resolve of this.waiters.splice(0)) resolve();
  }
}

/** The browser's voices for this language, best first. They load late in Chrome, hence the event. */
export function useVoices(lang: string) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!canSpeak()) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(rankVoices(synth.getVoices(), lang));
    const timer = window.setTimeout(load, 0);
    synth.addEventListener("voiceschanged", load);
    return () => {
      window.clearTimeout(timer);
      synth.removeEventListener("voiceschanged", load);
    };
  }, [lang]);
  return voices;
}

/**
 * Listens while the assistant is thinking or speaking, for the person talking over it. `isBargeIn`
 * decides whether what was heard is them rather than the assistant's own voice coming back through the
 * speakers; the first time it says yes, `onBargeIn` runs (stop speaking, drop the answer) and listening
 * carries on until they pause. `interrupted` tells the two endings apart: an interruption with what
 * they said, or a stretch with nothing but echo, after which the caller starts another watch.
 */
export function watchForBargeIn(
  lang: string,
  isBargeIn: (heard: string) => boolean,
  onBargeIn: (heard: string) => void,
  onHearing: (heard: string) => void,
) {
  const watch = {
    interrupted: false,
    ...listenOnce(lang, (heard) => {
      if (watch.interrupted) onHearing(heard);
      else if (isBargeIn(heard)) {
        watch.interrupted = true;
        onBargeIn(heard);
      }
    }),
  };
  return watch;
}
