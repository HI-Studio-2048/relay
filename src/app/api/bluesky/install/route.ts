import { requireUserId } from "@/lib/auth";
import { blueskyOauthConfigured, startBlueskySignIn } from "@/lib/channels/bluesky-oauth";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";
import { createState } from "@/lib/oauth/state";

function back(origin: string, error: string) {
  const url = new URL("/setup", origin);
  url.searchParams.set("error", error);
  return Response.redirect(url.toString(), 303);
}

/** Send the signed-in user to Bluesky's own sign-in page, optionally for the handle they typed. */
export async function GET(request: Request) {
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  if (!blueskyOauthConfigured()) return back(origin, "Sign in with Bluesky is not set up on this server yet");
  try {
    const userId = await requireUserId();
    const handle = new URL(request.url).searchParams.get("handle");
    const target = await startBlueskySignIn({ handle, state: createState(userId, "bluesky") });
    return new Response(null, { status: 303, headers: { location: target.toString() } });
  } catch (error) {
    log.warn("Bluesky sign-in start failed", error instanceof Error ? error.message : error);
    return back(origin, "Could not start the Bluesky sign-in. Check the handle and try again.");
  }
}
