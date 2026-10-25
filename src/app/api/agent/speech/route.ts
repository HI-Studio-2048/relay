import { SpeechError, synthesizeSpeech } from "@/lib/agent/speech";
import { requireUserId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { allowAttempt } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** The speaker asks for one sentence at a time, so this is generous for talking and still a ceiling. */
const SENTENCES_PER_HOUR = 600;

/**
 * POST { text, voice } → MP3 of the assistant saying it in a natural voice. Any error answer tells the
 * browser to speak with its own voice instead; 429 and 503 mean for the rest of the session.
 */
export async function POST(request: Request) {
  try {
    const ownerId = await requireUserId();
    const body = await readJson<{ text?: unknown; voice?: unknown }>(request);
    const text = typeof body.text === "string" ? body.text : "";
    if (!(await allowAttempt(`agent-speech:${ownerId}`, SENTENCES_PER_HOUR, 60 * 60))) {
      return json({ error: "That's a lot of talking this hour, so the browser's voice is taking over for a bit." }, 429);
    }
    const audio = await synthesizeSpeech({ ownerId, text, voice: body.voice, signal: request.signal });
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SpeechError) return json({ error: error.message }, error.status);
    return fail(error);
  }
}
