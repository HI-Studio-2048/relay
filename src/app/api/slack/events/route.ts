import { botForSlackTeam, handleSlackPost, slackTeamOf } from "@/lib/channels/slack-webhook";
import { slackAppSigningSecret } from "@/lib/channels/slack-install";

/**
 * The one URL for the shared Recatch Slack app, used for Event Subscriptions and Interactivity. Each
 * delivery names its workspace, which is matched to the account that installed the app there.
 */
export async function POST(request: Request) {
  return handleSlackPost(request, {
    secret: slackAppSigningSecret(),
    allowUnsignedChallenge: true,
    resolveBot: (payload) => botForSlackTeam(slackTeamOf(payload)),
  });
}
