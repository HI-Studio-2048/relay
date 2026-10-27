import { describe, expect, it, vi } from "vitest";
import { createKokoroEngine } from "@/components/assistant/kokoro";

/** A worker stand-in: records what the engine posts, and lets the test answer as the worker would. */
function fakeWorker() {
  const posted: Record<string, unknown>[] = [];
  const worker = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null as (() => void) | null,
    postMessage: (message: Record<string, unknown>) => posted.push(message),
    terminate: vi.fn(),
    reply: (data: unknown) => worker.onmessage?.({ data }),
  };
  return { worker, posted };
}

describe("Kokoro engine", () => {
  it("downloads only when asked, reports progress, then speaks", async () => {
    const { worker, posted } = fakeWorker();
    const makeWorker = vi.fn(() => worker as unknown as Worker);
    const engine = createKokoroEngine(makeWorker);
    const seen: string[] = [];
    engine.subscribe(() => seen.push(`${engine.status} ${engine.progress}`));
    expect(makeWorker).not.toHaveBeenCalled();
    await expect(engine.speak("Too soon.", "af_heart")).rejects.toThrow(/isn't ready/);

    engine.load();
    engine.load();
    expect(makeWorker).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([{ type: "load" }]);
    worker.reply({ type: "progress", loaded: 46, total: 92 });
    worker.reply({ type: "ready" });
    expect(seen).toEqual(["loading 0", "loading 0.5", "ready 1"]);

    const spoken = engine.speak("Hello there.", "af_heart");
    expect(posted[1]).toEqual({ type: "speak", id: 1, text: "Hello there.", voice: "af_heart" });
    const clip = new Blob(["wav"]);
    worker.reply({ type: "audio", id: 1, clip, seconds: 1.2, took: 0.4 });
    await expect(spoken).resolves.toEqual({ clip, seconds: 1.2, took: 0.4 });
  });

  it("drops a sentence nobody wants any more", async () => {
    const { worker, posted } = fakeWorker();
    const engine = createKokoroEngine(() => worker as unknown as Worker);
    engine.load();
    worker.reply({ type: "ready" });
    const stop = new AbortController();
    const spoken = engine.speak("Never mind.", "af_heart", stop.signal);
    stop.abort();
    await expect(spoken).rejects.toMatchObject({ name: "AbortError" });
    expect(posted.at(-1)).toEqual({ type: "drop", ids: [1] });
    // A late answer for it is ignored.
    worker.reply({ type: "audio", id: 1, clip: new Blob(["late"]), seconds: 1, took: 1 });
  });

  it("fails cleanly when the download breaks, and can try again", async () => {
    const first = fakeWorker();
    const second = fakeWorker();
    const makeWorker = vi.fn().mockReturnValueOnce(first.worker).mockReturnValueOnce(second.worker);
    const engine = createKokoroEngine(makeWorker as unknown as () => Worker);
    engine.load();
    first.worker.reply({ type: "failed", error: "network" });
    expect(engine.status).toBe("failed");
    expect(first.worker.terminate).toHaveBeenCalled();

    engine.load();
    expect(engine.status).toBe("loading");
    expect(second.posted).toEqual([{ type: "load" }]);
    second.worker.onerror?.();
    expect(engine.status).toBe("failed");
  });
});
