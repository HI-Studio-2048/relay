import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Stand-ins for the browser: an audio element that "plays" a clip in a tick, and the browser's voice. */
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

function speechReplies(handler: (text: string) => Promise<Response> | Response) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => handler(JSON.parse(String(init.body)).text as string));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** An MP3 stand-in that remembers which sentence it is, so the fake player can report what it played. */
function clip(text: string) {
  const blob = new Blob([text], { type: "audio/mpeg" });
  return new Response(blob, { status: 200, headers: { "content-type": "audio/mpeg" } });
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

  it("speaks each sentence in the natural voice, in order, even when the audio arrives out of order", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const fetchMock = speechReplies(async (text) => {
      // The first sentence comes back last.
      await new Promise((resolve) => setTimeout(resolve, text.startsWith("First") ? 20 : 1));
      return clip(text);
    });
    const states: boolean[] = [];
    const speaker = new Speaker("en-US", (speaking) => states.push(speaking));
    speaker.setNatural("cedar");
    speaker.feed("First sentence. Second one! Third");
    speaker.flush();
    await speaker.idle();
    expect(played).toEqual(["First sentence.", "Second one!", "Third"]);
    expect(spoken).toEqual([]);
    expect(states).toEqual([true, false]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toEqual({ text: "First sentence.", voice: "cedar" });
  });

  it("hands the rest of the session to the browser's voice after a refusal, and says why", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const fetchMock = speechReplies(() => Response.json({ error: "You've used this month's assistant allowance." }, { status: 429 }));
    const onFallback = vi.fn();
    const speaker = new Speaker("en-US", () => {}, onFallback);
    speaker.setNatural("marin");
    speaker.feed("One. Two. Three.");
    speaker.flush();
    await speaker.idle();
    expect(spoken).toEqual(["One.", "Two.", "Three."]);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0]![0]).toMatch(/allowance\. The browser's voice is speaking instead\./);
    const calls = fetchMock.mock.calls.length;

    speaker.feed("Four.");
    speaker.flush();
    await speaker.idle();
    expect(spoken).toEqual(["One.", "Two.", "Three.", "Four."]);
    expect(fetchMock.mock.calls.length).toBe(calls);

    // Choosing a natural voice again gives it another try.
    speechReplies((text) => clip(text));
    speaker.setNatural("marin");
    speaker.feed("Five.");
    speaker.flush();
    await speaker.idle();
    expect(played).toEqual(["Five."]);
  });

  it("uses the browser's voice when no natural voice is chosen", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const fetchMock = speechReplies((text) => clip(text));
    const speaker = new Speaker("en-US", () => {});
    speaker.feed("Just the browser.");
    speaker.flush();
    await speaker.idle();
    expect(spoken).toEqual(["Just the browser."]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops at once when cancelled and aborts what it was fetching", async () => {
    const { Speaker } = await import("@/components/assistant/voice");
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        signals.push(init.signal!);
        return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }),
    );
    const onFallback = vi.fn();
    const speaker = new Speaker("en-US", () => {}, onFallback);
    speaker.setNatural("marin");
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
