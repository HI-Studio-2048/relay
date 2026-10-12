import { requireUserId } from "@/lib/auth";
import { connectSlackInstall } from "@/lib/bots";
import { exchangeSlackCode, slackRedirectUri } from "@/lib/channels/slack-install";
import { publicUrl } from "@/lib/env";
import { redirectTo } from "@/lib/http";
import { log } from "@/lib/logger";
import { verifyState } from "@/lib/oauth/state";

function finish(key: "connected" | "error", message: string) {
  return redirectTo("/setup", key, message);
}

/** Slack sends the browser back here with a code. Check it is ours, trade it for the bot token and save the workspace. */
export async function GET(request: Request) {
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  const params = new URL(request.url).searchParams;
  try {
    const userId = await requireUserId();
    if (params.get("error")) return finish("error", "Slack install was cancelled");
    const check = verifyState(params.get("state"), { userId, provider: "slack" });
    if (!check.ok) {
      log.warn("Slack install state rejected", check.reason);
      return finish("error", "The Slack install could not be verified. Try Add to Slack again.");
    }
    const code = params.get("code");
    if (!code) return finish("error", "Slack did not send an install code");
    const install = await exchangeSlackCode(code, slackRedirectUri(origin));
    await connectSlackInstall({ ownerId: userId, install, origin });
    return finish("connected", `Slack connected: ${install.teamName}`);
  } catch (error) {
    log.warn("Slack install failed", error instanceof Error ? error.message : error);
    return finish("error", error instanceof Error && /^(Slack|This account)/.test(error.message) ? error.message : "Could not connect Slack");
  }
}
