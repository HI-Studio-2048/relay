import { statsByStep } from "@/lib/analytics";
import { json, fail, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    return json(await statsByStep(id));
  } catch (error) {
    return fail(error);
  }
}
