import { listActivity } from "@/lib/activity";
import { json, fail, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const rows = await listActivity(id, 30);
    return json({ activity: rows });
  } catch (error) {
    return fail(error);
  }
}
