import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NaturalClip, NaturalEngine, NaturalStatus } from "@/components/assistant/kokoro";

/** Stand-ins for the browser: an audio element that "plays" a clip in a tick, the browser's voice, and Kokoro. */
const played: string[] = [];
const spoken: string[] = [];
const clipText = new Map<string, string>();

class FakeAudio {
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play() {
    const src = this.src;
    if (src.startsWith("data:")) return Promise.resolve();
    setTimeout(() => {
      played.push(clipText.get(src) ?? src);
      this.onended?.();
    }, 1);
    return Promise.resolve();
  }
  pause() {}
}

class FakeUtterance {
  voice: unknown = null;
  lang = "";
  rate = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

const synth = {
  speak(utterance: FakeUtterance) {
    if (utterance.text.trim()) spoken.push(utterance.text);
    setTimeout(() => utterance.onend?.(), 1);
  },
  cancel: vi.fn(),
};

type Make = (text: string) => Promise<NaturalClip> | NaturalClip;

/** A Kokoro stand-in: a clip carries its sentence, so the fake player can report what it played. */
function fakeEngine(status: NaturalStatus, make: Make = (text) => clip(text)) {
  const engine = {
    status,
    progress: 0,
    load: vi.fn(() => {
      if (engine.status !== "ready") engine.status = "loading";
    }),
    speak: vi.fn(async (text: string, _voice: string, signal?: AbortSignal) => {
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      return make(text);
    }),
    subscribe: () => () => {},
  };
  return engine satisfies NaturalEngine;
}

function clip(text: string, took = 0.1, seconds = 1): NaturalClip {
  return { clip: new Blob([text], { type: "audio/wav" }), seconds, took };
}

describe("assistant speaker", () => {
  beforeEach(() => {
    played.length = 0;
    spoken.length = 0;
    clipText.clear();
    vi.stubGlobal("window", { speechSynthesis: synth, setTimeout, clearTimeout });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("Audio", FakeAudio);
    const createObjectURL = URL.createObjectURL.bind(URL);
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      const url = createObjectURL(blob);
      if (blob instanceof Blob) void blob.text().then((text) => clipText.set(url, text));
      return url;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("speaks each sentence in the natural voice, in order, even when the clips are made out of order", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const engine = fakeEngine("ready", async (text) => {
      // The first sentence comes back last.
      await new Promise((resolve) => setTimeout(resolve, text.startsWith("First") ? 20 : 1));
      return clip(text);
    });
    const states: boolean[] = [];
    const speaker = new Speaker("en-US", (speaking) => states.push(speaking), { engine });
    speaker.setNatural("bf_emma");
    speaker.feed("First sentence. Second one! Third");
    speaker.flush();
    await speaker.idle();
    expect(played).toEqual(["First sentence.", "Second one!", "Third"]);
    expect(spoken).toEqual([]);
    expect(states).toEqual([true, false]);
    expect(engine.speak.mock.calls[0]!.slice(0, 2)).toEqual(["First sentence.", "bf_emma"]);
    expect(engine.load).not.toHaveBeenCalled();
  });

  it("starts the download on first use and lets the browser speak until it is in", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const engine = fakeEngine("idle");
    const speaker = new Speaker("en-US", () => {}, { engine });
    speaker.setNatural("af_heart");
    speaker.feed("While it downloads. Still the browser.");
    expect(engine.load).toHaveBeenCalled();
    // The model arrives mid-answer; the answer keeps the voice it started with.
    engine.status = "ready";
    speaker.flush();
    await speaker.idle();
    expect(spoken).toEqual(["While it downloads.", "Still the browser."]);
    expect(engine.speak).not.toHaveBeenCalled();

    speaker.feed("Now the natural voice.");
    speaker.flush();
    await speaker.idle();
    expect(played).toEqual(["Now the natural voice."]);
  });

  it("hands the rest of the session to the browser's voice when the engine fails, and says why", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const engine = fakeEngine("ready", () => {
      throw new Error("out of memory");
    });
    const onFallback = vi.fn();
    const speaker = new Speaker("en-US", () => {}, { engine, onFallback });
    speaker.setNatural("af_heart");
    speaker.feed("One. Two. Three.");
    speaker.flush();
    await speaker.idle();
    expect(spoken).toEqual(["One.", "Two.", "Three."]);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0]![0]).toBe("The natural voice stopped working. The browser's voice is speaking instead.");
    const calls = engine.speak.mock.calls.length;

    speaker.feed("Four.");
    speaker.flush();
    await speaker.idle();
    expect(spoken).toEqual(["One.", "Two.", "Three.", "Four."]);
    expect(engine.speak.mock.calls.length).toBe(calls);

    // Choosing a natural voice again gives it another try.
    engine.speak.mockImplementation(async (text: string) => clip(text));
    speaker.setNatural("af_heart");
    speaker.feed("Five.");
    speaker.flush();
    await speaker.idle();
    expect(played).toEqual(["Five."]);
  });

  it("gives way to the browser's voice on a machine too slow to keep up", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    // Each clip takes three seconds to make one second of speech.
    const engine = fakeEngine("ready", (text) => clip(text, 3, 1));
    const onFallback = vi.fn();
    const speaker = new Speaker("en-US", () => {}, { engine, onFallback });
    speaker.setNatural("af_heart");
    speaker.feed("Warm up. Slow one. Slow two. After.");
    speaker.flush();
    await speaker.idle();
    expect(onFallback).toHaveBeenCalledWith("This computer is too slow for the natural voice. The browser's voice is speaking instead.");
    speaker.feed("Next answer.");
    speaker.flush();
    await speaker.idle();
    expect(spoken).toContain("Next answer.");
  });

  it("uses the browser's voice when no natural voice is chosen or the device has none", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const engine = fakeEngine("ready");
    const speaker = new Speaker("en-US", () => {}, { engine });
    speaker.feed("Just the browser.");
    speaker.flush();
    await speaker.idle();
    const phone = new Speaker("en-US", () => {});
    phone.setNatural("af_heart");
    phone.feed("A phone.");
    phone.flush();
    await phone.idle();
    expect(spoken).toEqual(["Just the browser.", "A phone."]);
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it("stops at once when cancelled and drops what it was making", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const signals: AbortSignal[] = [];
    const engine = fakeEngine("ready");
    engine.speak.mockImplementation(
      (_text: string, _voice: string, signal?: AbortSignal) =>
        new Promise<NaturalClip>((_resolve, reject) => {
          signals.push(signal!);
          signal!.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")));
        }),
    );
    const onFallback = vi.fn();
    const speaker = new Speaker("en-US", () => {}, { engine, onFallback });
    speaker.setNatural("af_heart");
    speaker.feed("Never heard. Nor this.");
    expect(speaker.speaking).toBe(true);
    speaker.cancel();
    await speaker.idle();
    expect(speaker.speaking).toBe(false);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(played).toEqual([]);
    expect(spoken).toEqual([]);
    expect(onFallback).not.toHaveBeenCalled();
  });
});
