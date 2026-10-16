import { requireRowAccess } from "@/lib/auth/resources";
import { findMissedComments, listCatchUpPosts, sendMissedComments } from "@/lib/comment-catch-up";
import { fail, json, readJson, type RouteParams } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Without a post: the account's recent posts. With ?accountId&postId: who would get the DM, nothing sent. */
export async function GET(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("flow", id);
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    const postId = url.searchParams.get("postId");
    if (!accountId || !postId) return json({ posts: await listCatchUpPosts(id) });
    return json({ missed: await findMissedComments(id, accountId, postId) });
  } catch (error) {
    return fail(error);
  }
}

/** Sends the DM to the next batch of missed commenters. The page repeats this until `remaining` is 0. */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("flow", id);
    const body = await readJson<{ accountId?: string; postId?: string; limit?: number }>(request);
    if (!body.accountId || !body.postId) return json({ error: "Pick a post first" }, 400);
    return json(await sendMissedComments({ flowId: id, accountId: body.accountId, postId: body.postId, limit: body.limit }));
  } catch (error) {
    return fail(error);
  }
}
