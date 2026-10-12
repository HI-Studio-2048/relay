import { requireUserId } from "@/lib/auth";
import { connectBlueskyOauth } from "@/lib/bots";
import { finishBlueskySignIn, revokeBlueskySession } from "@/lib/channels/bluesky-oauth";
import { publicUrl } from "@/lib/env";
import { redirectTo } from "@/lib/http";
import { log } from "@/lib/logger";
import { verifyState } from "@/lib/oauth/state";

function finish(key: "connected" | "error", message: string) {
  return redirectTo("/setup", key, message);
}

/** Bluesky sends the browser back here with a code. The library checks it, Recatch checks the sign-in was started by this user. */
export async function GET(request: Request) {
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  const params = new URL(request.url).searchParams;
  let did: string | null = null;
  try {
    const userId = await requireUserId();
    if (params.get("error")) return finish("error", "Bluesky sign-in was cancelled");
    const result = await finishBlueskySignIn(params);
    did = result.did;
    const check = verifyState(result.state, { userId, provider: "bluesky" });
    if (!check.ok) {
      log.warn("Bluesky sign-in state rejected", check.reason);
      await revokeBlueskySession(did);
      return finish("error", "The Bluesky sign-in could not be verified. Try again.");
    }
    const bot = await connectBlueskyOauth({ ownerId: userId, did });
    return finish("connected", `Bluesky connected: ${bot.name.replace(/ \(Bluesky\)$/, "")}`);
  } catch (error) {
    log.warn("Bluesky sign-in failed", error instanceof Error ? error.message : error);
    if (did) await revokeBlueskySession(did);
    return finish("error", error instanceof Error && /^(Bluesky|This account)/.test(error.message) ? error.message : "Could not connect Bluesky");
  }
}
