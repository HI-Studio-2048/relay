import { AiUnavailableError, translateText } from "@/lib/ai";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { listMessages } from "@/lib/store";

/**
 * Live Chat translation. `to: "agent"` translates a customer's message into the teammate's language;
 * `to: "customer"` rewrites a draft reply in the language the customer writes in.
 */
export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const body = await readJson<{ text?: unknown; to?: unknown; language?: unknown }>(request);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "Nothing to translate" }, 400);
    if (body.to === "customer") {
      const history = await listMessages(contactId);
      const samples = history
        .filter((message) => message.direction === "inbound" && !message.body.startsWith("["))
        .map((message) => message.body);
      if (samples.length === 0) return json({ error: "They have not written anything yet, so their language is unknown" }, 400);
      return json(await translateText({ text, target: null, customerSamples: samples }));
    }
    const language = typeof body.language === "string" && body.language.trim() ? body.language.trim().slice(0, 40) : "English";
    return json(await translateText({ text, target: language }));
  } catch (error) {
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    return fail(error);
  }
}
