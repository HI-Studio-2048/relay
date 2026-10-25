/**
 * Text helpers for the Overview assistant's voice mode. Pure and browser safe, with no speech APIs in
 * here, so they test without a browser. components/assistant/voice.ts does the listening and speaking.
 */

/** Markdown, links and emoji out, so the voice says what a person would say. Lines become sentences. */
export function speakableText(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(#{1,6}\s+|>\s?|[-*•]\s+|\d+[.)]\s+)/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line, index, lines) => (index < lines.length - 1 && !/[.!?…:;,]$/.test(line) ? `${line}.` : line))
    .join(" ");
}

/** A sentence longer than this is split at a comma or a space, so the voice can start sooner. */
const LONGEST = 220;

/**
 * Take the finished sentences off the front of streamed text, so speaking starts before the reply is
 * done. A sentence ends at . ! ? or … followed by a space, or at a line break; "4.99" and links stay
 * whole. With `final` the rest counts as a sentence too.
 */
export function takeSentences(buffer: string, final = false): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  for (;;) {
    const match = /[.!?…]+["')\]]*(?=\s)|\n/.exec(rest);
    let cut = match ? match.index + match[0].length : -1;
    if (cut < 0 && rest.length > LONGEST) {
      const window = rest.slice(0, LONGEST);
      const soft = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "));
      cut = soft > 40 ? soft + 1 : window.lastIndexOf(" ");
      if (cut <= 0) cut = LONGEST;
    }
    if (cut < 0) break;
    const sentence = speakableText(rest.slice(0, cut));
    rest = rest.slice(cut);
    if (sentence) sentences.push(sentence);
  }
  if (final) {
    const tail = speakableText(rest);
    if (tail) sentences.push(tail);
    rest = "";
  }
  return { sentences, rest };
}

export type VoiceLike = { name: string; lang: string; default?: boolean };

/** Names that mark a browser's better voices: neural and online ones first, then the well-known good ones. */
const NATURAL = [/natural/i, /neural/i, /premium/i, /enhanced/i, /online/i, /google/i, /siri/i];
const GOOD_NAMES = /samantha|ava|allison|aria|jenny|zoe|serena|karen|moira|tessa|daniel|evan|nathan|sonia|libby/i;
/** Novelty and robotic voices some systems ship. */
const POOR = /espeak|compact|novelty|whisper|bad news|bells|boing|bubbles|cellos|zarvox|trinoids|albert|jester|organ|superstar|wobble|grandma|grandpa|junior|ralph|fred|kathy|hysterical/i;

/**
 * The voices for `lang`, best first, for a voice that sounds like a person rather than a robot. Exact
 * locale beats same language; voices in other languages are left out.
 */
export function rankVoices<T extends VoiceLike>(voices: T[], lang: string): T[] {
  const wanted = lang.toLowerCase().replace("_", "-");
  const primary = wanted.split("-")[0];
  const scored = voices
    .map((voice) => {
      const voiceLang = voice.lang.toLowerCase().replace("_", "-");
      let score = voiceLang === wanted ? 40 : voiceLang.split("-")[0] === primary ? 25 : -1;
      if (score < 0) return { voice, score };
      NATURAL.forEach((pattern, index) => {
        if (pattern.test(voice.name)) score += 20 - index;
      });
      if (GOOD_NAMES.test(voice.name)) score += 8;
      if (POOR.test(voice.name)) score -= 40;
      if (voice.default) score += 2;
      return { voice, score: Math.max(0, score) };
    })
    .filter((item) => item.score >= 0);
  return scored.sort((a, b) => b.score - a.score).map((item) => item.voice);
}

/** Short words that count as an interruption on their own. */
const STOP_WORDS = new Set(["stop", "wait", "hold", "pause", "sorry", "hey", "no", "actually", "okay", "ok", "enough", "quiet"]);

function wordsOf(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * True when what the microphone heard is the person talking over the answer, rather than the answer
 * coming back through their speakers. Words the assistant itself is saying don't count, so an echo
 * never interrupts it: it takes two new words, mostly new, or one stop word like "wait".
 */
export function isBargeIn(heard: string, speaking: string) {
  const heardWords = wordsOf(heard);
  if (heardWords.length === 0) return false;
  const spoken = new Set(wordsOf(speaking));
  const fresh = heardWords.filter((word) => !spoken.has(word));
  if (fresh.some((word) => STOP_WORDS.has(word))) return true;
  return fresh.length >= 2 && fresh.length / heardWords.length >= 0.5;
}
