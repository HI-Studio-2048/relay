import { describe, expect, it } from "vitest";
import { defaultNaturalVoice, isNaturalVoice, NATURAL_VOICES, naturalVoiceDownloadMb, naturalVoiceEnglishOnly, naturalVoiceSupport, rankVoices, splitFirstClause, speakableText, takeSentences } from "@/lib/assistant-speech";

describe("assistant voice text", () => {
  it("reads links by their name and drops markdown, URLs and emoji", () => {
    expect(speakableText("Open [Flows](/flows) and press **Turn on** 🎉")).toBe("Open Flows and press Turn on");
    expect(speakableText("Swap in https://example.com/guide first.")).toBe("Swap in first.");
    expect(speakableText("Next:\n1. Connect Instagram\n2. Build the funnel")).toBe("Next: Connect Instagram. Build the funnel");
  });

  it("hands over whole sentences as the reply streams in", () => {
    const first = takeSentences("I saved it as a draft. Open it fr");
    expect(first).toEqual({ sentences: ["I saved it as a draft."], rest: " Open it fr" });
    const second = takeSentences(`${first.rest}om the link! It costs $4.99 a month`);
    expect(second.sentences).toEqual(["Open it from the link!"]);
    expect(second.rest).toBe(" It costs $4.99 a month");
    expect(takeSentences(second.rest, true)).toEqual({ sentences: ["It costs $4.99 a month"], rest: "" });
  });

  it("splits a long run without punctuation so speech starts early", () => {
    const long = `${"word ".repeat(30)}and then, ${"more ".repeat(30)}`;
    const { sentences, rest } = takeSentences(long);
    expect(sentences.length).toBeGreaterThan(0);
    expect(sentences.every((sentence) => sentence.length <= 220)).toBe(true);
    expect((sentences.join(" ") + rest).replace(/\s+/g, " ").trim()).toBe(long.replace(/\s+/g, " ").trim());
  });

  it("puts natural voices for the language first and leaves other languages out", () => {
    const voices = [
      { name: "Fred", lang: "en-US" },
      { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US" },
      { name: "Google UK English Female", lang: "en-GB" },
      { name: "Samantha", lang: "en-US", default: true },
      { name: "Amélie", lang: "fr-CA" },
    ];
    expect(rankVoices(voices, "en-US").map((voice) => voice.name)).toEqual([
      "Microsoft Aria Online (Natural) - English (United States)",
      "Samantha",
      "Google UK English Female",
      "Fred",
    ]);
    expect(rankVoices(voices, "fr-FR").map((voice) => voice.name)).toEqual(["Amélie"]);
  });
});

describe("natural voices", () => {
  it("knows its own voices and picks one for the browser's English", () => {
    expect(isNaturalVoice("af_heart")).toBe(true);
    expect(isNaturalVoice("robot-9000")).toBe(false);
    expect(isNaturalVoice(undefined)).toBe(false);
    expect(defaultNaturalVoice("en-US")).toBe("af_heart");
    expect(defaultNaturalVoice("en-GB")).toBe("bf_emma");
    expect(defaultNaturalVoice("en-AU")).toBe("bf_emma");
    expect(NATURAL_VOICES.every((voice) => isNaturalVoice(voice.id))).toBe(true);
  });

  it("is on by default on English desktops and offered to everyone else who can run it", () => {
    const desktop = {
      lang: "en-US",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      maxTouchPoints: 0,
      deviceMemory: 8,
      workers: true,
      wasm: true,
      webgpu: true,
    };
    expect(naturalVoiceSupport(desktop)).toBe("default");
    expect(naturalVoiceSupport({ ...desktop, lang: "en-GB" })).toBe("default");
    expect(naturalVoiceSupport({ ...desktop, deviceMemory: undefined })).toBe("default");
    expect(naturalVoiceSupport({ ...desktop, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15" })).toBe("default");
    // Everyone else can still pick it. Without WebGPU it is too slow to start on its own.
    expect(naturalVoiceSupport({ ...desktop, webgpu: false })).toBe("offer");
    expect(naturalVoiceSupport({ ...desktop, lang: "nl-NL" })).toBe("offer");
    expect(naturalVoiceSupport({ ...desktop, mobile: true })).toBe("offer");
    expect(naturalVoiceSupport({ ...desktop, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148" })).toBe("offer");
    expect(naturalVoiceSupport({ ...desktop, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/141.0 Mobile Safari/537.36" })).toBe("offer");
    // An iPad says it is a Mac, but has a touch screen.
    expect(naturalVoiceSupport({ ...desktop, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15", maxTouchPoints: 5 })).toBe("offer");
    expect(naturalVoiceSupport({ ...desktop, deviceMemory: 2 })).toBe("offer");
    expect(naturalVoiceSupport({ ...desktop, saveData: true })).toBe("offer");
    // Only a browser that can't run it at all goes without.
    expect(naturalVoiceSupport({ ...desktop, wasm: false })).toBe("none");
    expect(naturalVoiceSupport({ ...desktop, workers: false })).toBe("none");
    expect(naturalVoiceEnglishOnly("en-CA")).toBe(false);
    expect(naturalVoiceEnglishOnly("fr-FR")).toBe(true);
  });

  it("names the download for the model this browser will get", () => {
    expect(naturalVoiceDownloadMb(true)).toBe(155);
    expect(naturalVoiceDownloadMb(false)).toBe(92);
  });

  it("splits a long first sentence at its first comma so the opening words play sooner", () => {
    expect(splitFirstClause("Sure, here it is.")).toEqual(["Sure, here it is."]);
    expect(splitFirstClause("I drafted a reply to each one, and you can review them before anything is sent.")).toEqual([
      "I drafted a reply to each one,",
      "and you can review them before anything is sent.",
    ]);
    // A comma too early or too late leaves it whole.
    expect(splitFirstClause("Yes, you have three new comments waiting on your giveaway post.")).toEqual([
      "Yes, you have three new comments waiting on your giveaway post.",
    ]);
    expect(splitFirstClause("You have three new comments waiting on your giveaway post, too.")).toEqual([
      "You have three new comments waiting on your giveaway post, too.",
    ]);
    expect(splitFirstClause("You have three new comments waiting on your giveaway post today.")).toEqual([
      "You have three new comments waiting on your giveaway post today.",
    ]);
  });
});
