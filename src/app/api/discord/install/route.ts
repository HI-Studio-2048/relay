import { requireUserId } from "@/lib/auth";
import { buildDiscordInstallUrl, discordInstallConfigured, discordRedirectUri } from "@/lib/channels/discord-install";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";
import { createState } from "@/lib/oauth/state";

function back(origin: string, error: string) {
  const url = new URL("/setup", origin);
  url.searchParams.set("error", error);
  return Response.redirect(url.toString(), 303);
}

/** Send the signed-in user to Discord's "add Recatch to a server" screen. */
export async function GET(request: Request) {
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  if (!discordInstallConfigured()) return back(origin, "Add to Discord is not set up on this server yet");
  try {
    const userId = await requireUserId();
    const target = buildDiscordInstallUrl({ redirectUri: discordRedirectUri(origin), state: createState(userId, "discord") });
    return new Response(null, { status: 303, headers: { location: target } });
  } catch (error) {
    log.warn("Discord install start failed", error instanceof Error ? error.message : error);
    return back(origin, "Could not start the Discord install");
  }
}
