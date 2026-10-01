import { json, fail, readJson } from "@/lib/http";
import { sanitizeSegment } from "@/lib/segments";
import { broadcastAudience } from "@/lib/store";

/** Live audience count while composing. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; tagId?: string | null; segment?: unknown }>(request);
    if (!body.botId) return json({ error: "botId is required" }, 400);
    const audience = await broadcastAudience(body.botId, body.tagId ?? null, sanitizeSegment(body.segment));
    return json({
      count: audience.length,
      sample: audience.slice(0, 5).map((contact) =>
        [contact.firstName, contact.lastName].filter(Boolean).join(" ") || (contact.username ? `@${contact.username}` : "Someone"),
      ),
    });
  } catch (error) {
    return fail(error);
  }
}
