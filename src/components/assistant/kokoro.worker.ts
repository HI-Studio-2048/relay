/**
 * Runs Kokoro off the main thread, so the page stays smooth while a sentence is made. kokoro.ts starts
 * it on first use. The library is the pinned browser build from jsDelivr rather than an npm dependency:
 * the npm package pulls in onnxruntime-node (over 200 MB) that the server would install and never run.
 * The model and voices come from Hugging Face, and the browser caches them, so the download happens once.
 *
 * In:  { type: "load" } | { type: "speak", id, text, voice } | { type: "drop", ids }
 * Out: { type: "progress", loaded, total } | { type: "ready" } | { type: "failed", error }
 *      | { type: "audio", id, clip, seconds, took } | { type: "error", id, error }
 */

const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

type RawAudio = { audio: Float32Array; sampling_rate: number; toBlob(): Blob };
type Tts = { generate(text: string, options: { voice: string }): Promise<RawAudio> };
type KokoroModule = {
  KokoroTTS: {
    from_pretrained(model: string, options: { dtype: string; device: string; progress_callback?: (event: LoadProgress) => void }): Promise<Tts>;
  };
};
type LoadProgress = { status: string; file?: string; loaded?: number; total?: number };
type Job = { id: number; text: string; voice: string };
type Incoming = { type: "load" } | ({ type: "speak" } & Job) | { type: "drop"; ids: number[] };

const scope = self as unknown as { postMessage(message: unknown): void; onmessage: ((event: { data: Incoming }) => void) | null };

let tts: Promise<Tts> | null = null;
const jobs: Job[] = [];
let working = false;

function load() {
  tts ??= (async () => {
    const files = new Map<string, { loaded: number; total: number }>();
    const kokoro = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ KOKORO_URL)) as KokoroModule;
    return kokoro.KokoroTTS.from_pretrained(MODEL_ID, {
      // 8-bit weights: 92 MB, and it runs on any machine through WebAssembly.
      dtype: "q8",
      device: "wasm",
      progress_callback: (event) => {
        if (event.status !== "progress" || !event.file || !event.total) return;
        files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
        let loaded = 0;
        let total = 0;
        for (const file of files.values()) {
          loaded += file.loaded;
          total += file.total;
        }
        scope.postMessage({ type: "progress", loaded, total });
      },
    });
  })();
  return tts;
}

/** One sentence at a time, in the order they were asked for. */
async function work() {
  if (working) return;
  working = true;
  try {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      try {
        const model = await load();
        const started = performance.now();
        const audio = await model.generate(job.text, { voice: job.voice });
        scope.postMessage({
          type: "audio",
          id: job.id,
          clip: audio.toBlob(),
          seconds: audio.audio.length / audio.sampling_rate,
          took: (performance.now() - started) / 1000,
        });
      } catch (error) {
        scope.postMessage({ type: "error", id: job.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    working = false;
  }
}

scope.onmessage = ({ data }) => {
  if (data.type === "load") {
    load().then(
      () => scope.postMessage({ type: "ready" }),
      (error: unknown) => {
        tts = null;
        scope.postMessage({ type: "failed", error: error instanceof Error ? error.message : String(error) });
      },
    );
  } else if (data.type === "speak") {
    jobs.push({ id: data.id, text: data.text, voice: data.voice });
    void work();
  } else if (data.type === "drop") {
    const dropped = new Set(data.ids);
    for (let index = jobs.length - 1; index >= 0; index -= 1) if (dropped.has(jobs[index]!.id)) jobs.splice(index, 1);
  }
};

// A module, so these names stay out of the global scope.
export {};
