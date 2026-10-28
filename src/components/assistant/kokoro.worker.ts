/**
 * Runs Kokoro off the main thread, so the page stays smooth while a sentence is made. kokoro.ts starts
 * it on first use. The library is the pinned browser build from jsDelivr rather than an npm dependency:
 * the npm package pulls in onnxruntime-node (over 200 MB) that the server would install and never run.
 * The model and voices come from Hugging Face, and the browser caches them, so the download happens once.
 *
 * In:  { type: "load" } | { type: "speak", id, text, voice } | { type: "drop", ids }
 * Out: { type: "progress", loaded, total } | { type: "ready", device } | { type: "failed", error }
 *      | { type: "audio", id, clip, seconds, took } | { type: "error", id, error }
 */

const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

type RawAudio = { audio: Float32Array; sampling_rate: number; toBlob(): Blob };
type Tts = { generate(text: string, options: { voice: string }): Promise<RawAudio> };
type Device = "webgpu" | "wasm";
type KokoroModule = {
  KokoroTTS: {
    from_pretrained(model: string, options: { dtype: string; device: string; progress_callback?: (event: LoadProgress) => void }): Promise<Tts>;
  };
};
type LoadProgress = { status: string; file?: string; loaded?: number; total?: number };
type Job = { id: number; text: string; voice: string };
type Incoming = { type: "load" } | ({ type: "speak" } & Job) | { type: "drop"; ids: number[] };

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: Incoming }) => void) | null;
  navigator: { gpu?: { requestAdapter(): Promise<unknown> } };
};

/**
 * Measured on an 8-core Mac (2026-10-27): on the graphics card a ten-word sentence takes about 1.3
 * seconds to make 3.5 seconds of speech; through WebAssembly it takes 7, twice as long as it plays,
 * because without cross-origin isolation WebAssembly gets one thread. So the graphics card when the
 * browser has one. The 4-bit model there is 155 MB and as fast as the full one (326 MB); the 16-bit
 * one came out silent on some sentences. WebAssembly keeps the 8-bit model, which suits it.
 */
const SETTINGS: Record<Device, { dtype: string; device: Device }> = {
  webgpu: { dtype: "q4f16", device: "webgpu" },
  wasm: { dtype: "q8", device: "wasm" },
};

async function hasWebGpu() {
  try {
    return Boolean(await scope.navigator.gpu?.requestAdapter());
  } catch {
    return false;
  }
}

let tts: Promise<{ model: Tts; device: Device }> | null = null;
const jobs: Job[] = [];
let working = false;

function load() {
  tts ??= (async () => {
    const files = new Map<string, { loaded: number; total: number }>();
    const kokoro = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ KOKORO_URL)) as KokoroModule;
    const progress_callback = (event: LoadProgress) => {
      if (event.status !== "progress" || !event.file || !event.total) return;
      files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
      let loaded = 0;
      let total = 0;
      for (const file of files.values()) {
        loaded += file.loaded;
        total += file.total;
      }
      scope.postMessage({ type: "progress", loaded, total });
    };
    let device: Device = (await hasWebGpu()) ? "webgpu" : "wasm";
    let model: Tts;
    try {
      model = await kokoro.KokoroTTS.from_pretrained(MODEL_ID, { ...SETTINGS[device], progress_callback });
    } catch (error) {
      if (device === "wasm") throw error;
      // A graphics card the model can't run on: WebAssembly still works, only slower.
      files.clear();
      device = "wasm";
      model = await kokoro.KokoroTTS.from_pretrained(MODEL_ID, { ...SETTINGS[device], progress_callback });
    }
    // The first sentence pays for warming up (about 3 seconds); pay it now, before anyone is waiting.
    await model.generate("Ready.", { voice: "af_heart" });
    return { model, device };
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
        const { model } = await load();
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
      ({ device }) => scope.postMessage({ type: "ready", device }),
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
