import { requireUserId } from "@/lib/auth";
import { slackInstallConfigured } from "@/lib/channels/slack-install";
import { fail, json } from "@/lib/http";

/** What this server can do without the customer pasting credentials, so the Setup page can show the one-click option. */
export async function GET() {
  try {
    await requireUserId();
    return json({ slackInstall: slackInstallConfigured() });
  } catch (error) {
    return fail(error);
  }
}
