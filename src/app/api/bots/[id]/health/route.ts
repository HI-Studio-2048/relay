import { healthCheckBot } from "@/lib/bots";
import { json, fail, type RouteParams } from "@/lib/http";

export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    return json(await healthCheckBot(id, request.url));
  } catch (error) {
    return fail(error, "Health check failed");
  }
}
