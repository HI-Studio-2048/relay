import { json, fail } from "@/lib/http";
import { listInboxThreads } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    return json({ threads: await listInboxThreads(botId) });
  } catch (error) {
    return fail(error);
  }
}
