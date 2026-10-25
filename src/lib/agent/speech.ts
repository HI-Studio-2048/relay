import { budgetExhaustedMessage, readAssistantBudget, recordAssistantUsage } from "@/lib/agent/budget";
import { priceSpeech } from "@/lib/agent/pricing";
import { workspaceAiProvider } from "@/lib/agent/provider";
import { DEFAULT_NATURAL_VOICE, isNaturalVoice, MAX_SPEECH_CHARS } from "@/lib/assistant-speech";
import { redactSecrets } from "@/lib/crypto";
import { log } from "@/lib/logger";

/**
 * The assistant's natural voice: OpenAI text to speech, so every browser hears the same lifelike voice
 * instead of whatever its system ships. A login whose account saved its own OpenAI key speaks on that
 * key and is never counted. Everyone else speaks on the company's OPENAI_API_KEY, priced per character
 * (agent/pricing.ts) against the same monthly allowance as the assistant's Claude calls. With neither,
 * or once the allowance is used up, the browser speaks instead (components/assistant/voice.ts).
 */
export const SPEECH_MODEL = "gpt-4o-mini-tts";

const SPEECH_URL = "https://api.openai.com/v1/audio/speech";

/** How it should sound. gpt-4o-mini-tts follows plain-language direction on tone and pace. */
const SPEECH_INSTRUCTIONS =
  "You are a friendly teammate talking someone through their messaging setup. Sound warm, relaxed and conversational, like a real person on a call: natural pace, gentle pauses, light and genuine. Never sound like an announcer, a narrator or a robot.";

type SpeechKey = { apiKey: string; billed: boolean };

/** Whose key speaks for this login, or null when only the browser can. */
export async function speechKey(ownerId: string): Promise<SpeechKey | null> {
  const provider = await workspaceAiProvider(ownerId);
  if (provider?.kind === "openai") return { apiKey: provider.apiKey, billed: false };
  const companyKey = process.env.OPENAI_API_KEY?.trim();
  return companyKey ? { apiKey: companyKey, billed: true } : null;
}

export class SpeechError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Speak one piece of text. Resolves to the MP3 stream from OpenAI; throws SpeechError with the status
 * the route should answer when there is no key (503), the allowance is used up (429) or OpenAI fails.
 * A billed call is recorded once OpenAI accepts it.
 */
export async function synthesizeSpeech(input: { ownerId: string; text: string; voice?: unknown; signal?: AbortSignal }) {
  const text = input.text.trim().slice(0, MAX_SPEECH_CHARS);
  if (!text) throw new SpeechError("Text is required", 400);
  const key = await speechKey(input.ownerId);
  if (!key) throw new SpeechError("The natural voice isn't switched on.", 503);
  if (key.billed) {
    const budget = await readAssistantBudget(input.ownerId);
    if (budget.exhausted) throw new SpeechError(budgetExhaustedMessage(budget), 429);
  }
  const response = await fetch(SPEECH_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: SPEECH_MODEL,
      voice: isNaturalVoice(input.voice) ? input.voice : DEFAULT_NATURAL_VOICE,
      input: text,
      instructions: SPEECH_INSTRUCTIONS,
      response_format: "mp3",
    }),
    signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    log.warn("OpenAI speech failed", response.status, redactSecrets(detail.slice(0, 300)));
    // A rejected own key is the customer's to fix; anything else is ours, and the browser takes over.
    throw new SpeechError(response.status === 401 && !key.billed ? "Your OpenAI key was refused." : "The natural voice is unavailable right now.", 502);
  }
  if (key.billed) {
    await recordAssistantUsage(input.ownerId, priceSpeech(text)).catch((error: unknown) => log.error("Could not record assistant speech usage", error));
  }
  return response.body;
}
