import { describe, expect, it } from "vitest";
import { rankVoices, speakableText, takeSentences } from "@/lib/assistant-speech";

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
