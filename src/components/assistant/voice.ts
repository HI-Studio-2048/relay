"use client";

import { useEffect, useState } from "react";
import type { NaturalClip, NaturalEngine } from "@/components/assistant/kokoro";
import { rankVoices, splitFirstClause, takeSentences } from "@/lib/assistant-speech";

/**
 * Speech for the assistant: SpeechRecognition to hear the person (Chrome, Edge and Safari; not Firefox),
 * and to answer out loud the natural voice (Kokoro, run in this browser by kokoro.ts) when it fits the
 * device, with the browser's own speechSynthesis as the fallback. None of it costs Recatch anything.
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

/** A tenth of a second of silence, played from the tap that turns voice on so iOS lets audio play afterwards. */
function silentWav() {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((char, index) => (bytes[offset + index] = char.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

type Line = { text: string; audio: Promise<Blob | null> | null };

/** Sentences made ahead in the natural voice, so the next one is ready when this one ends. */
const PREFETCH = 2;

/** A clip that takes this much longer to make than to play means the machine can't keep up. */
const TOO_SLOW = 1.2;

type SpeakerOptions = {
  /** Said once when the natural voice gives way to the browser's for the rest of the session. */
  onFallback?: (message: string) => void;
  engine?: NaturalEngine | null;
};

/**
 * Speaks streamed text sentence by sentence, so the answer starts while it is still being written.
 * With a natural voice set, the first sentence starts the engine's one-time download, and until it is
 * in, answers are spoken by the browser. Each answer keeps the voice it started with, so voices never
 * change mid-answer. If the engine fails or this machine is too slow for it, the rest of the session
 * speaks in the browser's voice and `onFallback` says why. `idle()` resolves once everything queued
 * has been said or cancelled.
 */
export class Speaker {
  private queue: Line[] = [];
  private active = false;
  private buffer = "";
  private generation = 0;
  private waiters: (() => void)[] = [];
  private requests = new Set<AbortController>();
  private player: HTMLAudioElement | null = null;
  private stopPlaying: (() => void) | null = null;
  private natural: string | null = null;
  private naturalOff = false;
  /** Whether the answer playing now is in the natural voice. */
  private runNatural = false;
  private clipsMade = 0;
  private slowClips = 0;
  private readonly onFallback: (message: string) => void;
  private readonly engine: NaturalEngine | null;
  voice: SpeechSynthesisVoice | null = null;

  constructor(
    private readonly lang: string,
    private readonly onSpeaking: (speaking: boolean) => void,
    options: SpeakerOptions = {},
  ) {
    this.onFallback = options.onFallback ?? (() => {});
    this.engine = options.engine ?? null;
  }

  /** The natural voice to speak in, or null for the browser's. Choosing again retries after a fallback. */
  setNatural(voice: string | null) {
    this.natural = voice;
    this.naturalOff = false;
    this.slowClips = 0;
  }

  private get usingNatural() {
    return this.natural !== null && !this.naturalOff && this.engine !== null && typeof Audio !== "undefined";
  }

  /**
   * iOS only plays sound after a tap, so call this from the tap that turns voice on. It also starts
   * loading the natural voice, so it is ready by the time the first answer comes back.
   */
  unlock() {
    if (this.usingNatural) {
      if (this.engine!.status !== "ready") this.engine!.load();
      const player = this.audio();
      player.src = silentWav();
      void player.play().catch(() => {});
    }
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
    this.queue = [];
    this.active = false;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    this.stopPlaying?.();
    if (canSpeak()) window.speechSynthesis.cancel();
    this.settle();
  }

  get speaking() {
    return this.active || this.queue.length > 0;
  }

  idle(): Promise<void> {
    if (!this.speaking) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private say(text: string) {
    if (!this.usingNatural && !canSpeak()) return;
    // First use: start the download. The browser speaks until it is in.
    if (this.usingNatural && this.engine!.status !== "ready") this.engine!.load();
    // The first line of an answer is made while the person waits, so keep it short.
    const lines = !this.active && this.queue.length === 0 && this.usingNatural && this.engine!.status === "ready" ? splitFirstClause(text) : [text];
    for (const line of lines) this.queue.push({ text: line, audio: null });
    if (this.active) this.prefetch();
    else void this.run();
  }

  /** Play the queue in order until it is empty or cancelled. */
  private async run() {
    const generation = this.generation;
    this.active = true;
    this.runNatural = this.usingNatural && this.engine!.status === "ready";
    this.onSpeaking(true);
    for (;;) {
      this.prefetch();
      const line = this.queue.shift();
      if (!line) break;
      this.prefetch();
      const audio = line.audio ? await line.audio : null;
      if (generation !== this.generation) return;
      const played = audio ? await this.play(audio) : false;
      if (generation !== this.generation) return;
      if (!played) await this.speakInBrowser(line.text);
      if (generation !== this.generation) return;
    }
    this.active = false;
    this.settle();
  }

  private prefetch() {
    if (!this.runNatural || !this.usingNatural) return;
    for (const line of this.queue.slice(0, PREFETCH)) line.audio ??= this.make(line.text);
  }

  private async make(text: string): Promise<Blob | null> {
    const request = new AbortController();
    this.requests.add(request);
    try {
      const made = await this.engine!.speak(text, this.natural!, request.signal);
      this.checkPace(made);
      return made.clip;
    } catch {
      if (!request.signal.aborted) this.fallBack("The natural voice stopped working.");
      return null;
    } finally {
      this.requests.delete(request);
    }
  }

  /** The first clip includes warming up, so it doesn't count. Two slow ones after it and the browser takes over. */
  private checkPace(made: NaturalClip) {
    this.clipsMade += 1;
    if (this.clipsMade === 1 || made.took <= made.seconds * TOO_SLOW) return;
    this.slowClips += 1;
    if (this.slowClips >= 2) this.fallBack("This computer is too slow for the natural voice.");
  }

  /** Switch to the browser's voice for the rest of the session rather than mixing voices sentence by sentence. */
  private fallBack(reason: string) {
    if (this.naturalOff) return;
    this.naturalOff = true;
    this.onFallback(canSpeak() ? `${reason} The browser's voice is speaking instead.` : reason);
  }

  private audio() {
    this.player ??= new Audio();
    return this.player;
  }

  /** Resolves true once the clip has played (or was stopped), false if it would not play. */
  private play(clip: Blob) {
    return new Promise<boolean>((resolve) => {
      const player = this.audio();
      const url = URL.createObjectURL(clip);
      let finished = false;
      const finish = (played: boolean) => {
        if (finished) return;
        finished = true;
        player.onended = null;
        player.onerror = null;
        this.stopPlaying = null;
        URL.revokeObjectURL(url);
        resolve(played);
      };
      this.stopPlaying = () => {
        player.pause();
        finish(true);
      };
      player.onended = () => finish(true);
      player.onerror = () => finish(false);
      player.src = url;
      player.play().catch(() => finish(false));
    });
  }

  private speakInBrowser(text: string) {
    return new Promise<void>((resolve) => {
      if (!canSpeak()) return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) {
        utterance.voice = this.voice;
        utterance.lang = this.voice.lang;
      } else {
        utterance.lang = this.lang;
      }
      utterance.rate = 1.03;
      // Some browsers drop the end event now and then; never wait longer than the sentence could take.
      const watchdog = window.setTimeout(() => done(), 4000 + text.length * 110);
      const done = () => {
        window.clearTimeout(watchdog);
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    });
  }

  private settle() {
    if (this.speaking) return;
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
