import { requireUserId } from "@/lib/auth";
import { buildDiscordInstallUrl, discordInstallConfigured, discordRedirectUri } from "@/lib/channels/discord-install";
import { publicUrl } from "@/lib/env";
import { redirectTo } from "@/lib/http";
import { log } from "@/lib/logger";
import { createState } from "@/lib/oauth/state";

function back(error: string) {
  return redirectTo("/setup", "error", error);
}

/** Send the signed-in user to Discord's "add Recatch to a server" screen. */
export async function GET(request: Request) {
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  if (!discordInstallConfigured()) return back("Add to Discord is not set up on this server yet");
  try {
    const userId = await requireUserId();
    const target = buildDiscordInstallUrl({ redirectUri: discordRedirectUri(origin), state: createState(userId, "discord") });
    return new Response(null, { status: 303, headers: { location: target } });
  } catch (error) {
    log.warn("Discord install start failed", error instanceof Error ? error.message : error);
    return back("Could not start the Discord install");
  }
}
