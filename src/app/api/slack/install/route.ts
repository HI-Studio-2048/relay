import { requireUserId } from "@/lib/auth";
import { buildSlackAuthorizeUrl, slackInstallConfigured, slackRedirectUri } from "@/lib/channels/slack-install";
import { publicUrl } from "@/lib/env";
import { redirectTo } from "@/lib/http";
import { log } from "@/lib/logger";
import { createState } from "@/lib/oauth/state";

function back(error: string) {
  return redirectTo("/setup", "error", error);
}

/** Send the signed-in user to Slack's "allow Recatch in this workspace" screen. */
export async function GET(request: Request) {
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  if (!slackInstallConfigured()) return back("Add to Slack is not set up on this server yet");
  try {
    const userId = await requireUserId();
    const target = buildSlackAuthorizeUrl({ redirectUri: slackRedirectUri(origin), state: createState(userId, "slack") });
    return new Response(null, { status: 303, headers: { location: target } });
  } catch (error) {
    log.warn("Slack install start failed", error instanceof Error ? error.message : error);
    return back("Could not start the Slack install");
  }
}
