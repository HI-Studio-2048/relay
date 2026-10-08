import { requireBotAccess } from "@/lib/auth";
import { json, fail } from "@/lib/http";
import { searchContacts } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const botId = url.searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    const q = url.searchParams.get("q") ?? undefined;
    const tagId = url.searchParams.get("tagId") ?? undefined;
    const contacts = await searchContacts(botId, q, tagId);
    return json({ contacts });
  } catch (error) {
    return fail(error);
  }
}
