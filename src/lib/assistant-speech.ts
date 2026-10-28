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

/**
 * The natural voices: Kokoro, an open (Apache 2.0) speech model that runs in the person's own browser
 * (components/assistant/kokoro.ts), so speaking costs Recatch nothing. Every browser that can run it
 * lists them; see naturalVoiceSupport for where they start on their own. The picker stores these as
 * "natural:<id>" beside the browser's voices.
 */
export const NATURAL_VOICES = [
  { id: "af_heart", label: "Heart (American)" },
  { id: "af_bella", label: "Bella (American)" },
  { id: "am_michael", label: "Michael (American)" },
  { id: "am_fenrir", label: "Fenrir (American)" },
  { id: "bf_emma", label: "Emma (British)" },
  { id: "bm_george", label: "George (British)" },
] as const;

export type NaturalVoiceId = (typeof NATURAL_VOICES)[number]["id"];

export function isNaturalVoice(id: unknown): id is NaturalVoiceId {
  return NATURAL_VOICES.some((voice) => voice.id === id);
}

/** The natural voice that suits the browser's English: British for en-GB and nearby, American otherwise. */
export function defaultNaturalVoice(lang: string): NaturalVoiceId {
  return /^en-(gb|ie|au|nz|za|in)\b/i.test(lang) ? "bf_emma" : "af_heart";
}

/** The model download, for telling people what they are getting before it starts (kokoro.worker.ts picks the model). */
export function naturalVoiceDownloadMb(webgpu: boolean) {
  return webgpu ? 155 : 92;
}

/**
 * The first sentence of an answer is made before anything is heard, so a long one is split at its
 * first comma: the opening words play while the rest is made. Short sentences stay whole.
 */
export function splitFirstClause(sentence: string): string[] {
  if (sentence.split(/\s+/).length <= 8) return [sentence];
  const match = /^(\S+(?:\s+\S+){2,}?[,;:])\s+(\S[\s\S]*)$/.exec(sentence);
  if (!match || match[2].split(/\s+/).length < 3) return [sentence];
  return [match[1], match[2]];
}

export type DeviceTraits = {
  lang: string;
  userAgent: string;
  /** navigator.userAgentData.mobile where the browser has it. */
  mobile?: boolean;
  maxTouchPoints: number;
  /** navigator.deviceMemory in GB, where the browser has it (Chrome, Edge). */
  deviceMemory?: number;
  /** The person asked for less data (navigator.connection.saveData). */
  saveData?: boolean;
  workers: boolean;
  wasm: boolean;
  /** The browser can run the model on the graphics card (navigator.gpu gave an adapter). */
  webgpu: boolean;
};

/**
 * Whether the natural voices are on by default ("default"), listed for the person to pick ("offer"),
 * or out of reach ("none", a browser without workers or WebAssembly). Everyone who can run them gets
 * them. They start on their own only on English desktops whose browser has WebGPU: without it the model
 * is too slow to keep up with speech (see kokoro.worker.ts), and elsewhere the download is large for a
 * phone plan, the model is memory hungry, or the voices can't speak the browser's language. There the
 * browser's voice stays first until someone picks one. iPads report a Mac, so a Mac with a touch
 * screen counts as a tablet.
 */
export function naturalVoiceSupport(device: DeviceTraits): "default" | "offer" | "none" {
  if (!device.workers || !device.wasm) return "none";
  const fitsDefault =
    device.webgpu &&
    /^en\b/i.test(device.lang) &&
    !device.saveData &&
    !(device.deviceMemory !== undefined && device.deviceMemory < 4) &&
    !device.mobile &&
    !/android|iphone|ipad|ipod|mobile|silk|kindle/i.test(device.userAgent) &&
    !(/macintosh/i.test(device.userAgent) && device.maxTouchPoints > 1);
  return fitsDefault ? "default" : "offer";
}

/** Kokoro only speaks English, which the voice menu says to people whose browser is in another language. */
export function naturalVoiceEnglishOnly(lang: string) {
  return !/^en\b/i.test(lang);
}
