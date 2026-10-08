import { statsByStep } from "@/lib/analytics";
import { requireRowAccess } from "@/lib/auth/resources";
import { json, fail, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("flow", id);
    return json(await statsByStep(id));
  } catch (error) {
    return fail(error);
  }
}
