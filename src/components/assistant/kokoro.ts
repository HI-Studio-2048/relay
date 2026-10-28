"use client";

/**
 * The natural voice engine: Kokoro in a web worker (kokoro.worker.ts), started the first time someone
 * talks with a natural voice picked. Until the model is in, and if it never loads, the browser's own
 * voice speaks (voice.ts). One engine serves the whole console, so the model loads once per visit and
 * the browser's cache keeps it for the next.
 */
export type NaturalStatus = "idle" | "loading" | "ready" | "failed";

/** One spoken sentence: a WAV clip, how long it plays, and how long it took to make (seconds). */
export type NaturalClip = { clip: Blob; seconds: number; took: number };

export type NaturalEngine = {
  readonly status: NaturalStatus;
  /** How much of the download is in, 0 to 1. */
  readonly progress: number;
  /** Start the download. Does nothing while loading or once ready; after a failure it tries again. */
  load(): void;
  speak(text: string, voice: string, signal?: AbortSignal): Promise<NaturalClip>;
  subscribe(listener: () => void): () => void;
};

type WorkerMessage =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "failed"; error: string }
  | ({ type: "audio"; id: number } & NaturalClip)
  | { type: "error"; id: number; error: string };

type Pending = { resolve: (clip: NaturalClip) => void; reject: (error: Error) => void };

class KokoroEngine implements NaturalEngine {
  status: NaturalStatus = "idle";
  progress = 0;
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private listeners = new Set<() => void>();

  constructor(private readonly makeWorker: () => Worker) {}

  load() {
    if (this.status === "loading" || this.status === "ready") return;
    this.update("loading", 0);
    this.connect().postMessage({ type: "load" });
  }

  speak(text: string, voice: string, signal?: AbortSignal) {
    if (this.status !== "ready" || !this.worker) return Promise.reject(new Error("The natural voice isn't ready"));
    const worker = this.worker;
    const id = ++this.nextId;
    return new Promise<NaturalClip>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: "speak", id, text, voice });
      signal?.addEventListener(
        "abort",
        () => {
          if (!this.pending.delete(id)) return;
          worker.postMessage({ type: "drop", ids: [id] });
          reject(new DOMException("Stopped", "AbortError"));
        },
        { once: true },
      );
    });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private connect() {
    if (this.worker) return this.worker;
    const worker = this.makeWorker();
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.receive(event.data);
    worker.onerror = () => this.fail("The natural voice couldn't start.");
    this.worker = worker;
    return worker;
  }

  private receive(message: WorkerMessage) {
    if (message.type === "progress") {
      this.update("loading", message.total ? Math.min(1, message.loaded / message.total) : 0);
    } else if (message.type === "ready") {
      this.update("ready", 1);
    } else if (message.type === "failed") {
      this.fail(message.error);
    } else {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.type === "audio") pending.resolve({ clip: message.clip, seconds: message.seconds, took: message.took });
      else pending.reject(new Error(message.error));
    }
  }

  private fail(error: string) {
    for (const pending of this.pending.values()) pending.reject(new Error(error));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.update("failed", 0);
  }

  private update(status: NaturalStatus, progress: number) {
    this.status = status;
    this.progress = progress;
    for (const listener of this.listeners) listener();
  }
}

/** Written out in full so the bundler sees the worker and compiles it with its own chunk. */
function startKokoroWorker() {
  return new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
}

export function createKokoroEngine(makeWorker: () => Worker = startKokoroWorker): NaturalEngine {
  return new KokoroEngine(makeWorker);
}

/** Whether this browser can run the model on the graphics card, which is several times faster. */
export async function webGpuAvailable() {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return Boolean(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

let shared: NaturalEngine | null = null;

/** The console's one engine. Nothing downloads until something calls load(). */
export function kokoroEngine() {
  shared ??= createKokoroEngine();
  return shared;
}
