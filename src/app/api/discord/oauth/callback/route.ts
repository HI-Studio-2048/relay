import { requireUserId } from "@/lib/auth";
import { connectDiscordInstall } from "@/lib/bots";
import { discordRedirectUri, exchangeDiscordInstall } from "@/lib/channels/discord-install";
import { publicUrl } from "@/lib/env";
import { redirectTo } from "@/lib/http";
import { log } from "@/lib/logger";
import { verifyState } from "@/lib/oauth/state";

function finish(key: "connected" | "error", message: string) {
  return redirectTo("/setup", key, message);
}

/** Discord sends the browser back here with a code. Check it is ours, ask Discord which server was chosen and save it. */
export async function GET(request: Request) {
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  const params = new URL(request.url).searchParams;
  try {
    const userId = await requireUserId();
    if (params.get("error")) return finish("error", "Discord install was cancelled");
    const check = verifyState(params.get("state"), { userId, provider: "discord" });
    if (!check.ok) {
      log.warn("Discord install state rejected", check.reason);
      return finish("error", "The Discord install could not be verified. Try Add to Discord again.");
    }
    const code = params.get("code");
    if (!code) return finish("error", "Discord did not send an install code");
    const install = await exchangeDiscordInstall(code, discordRedirectUri(origin));
    await connectDiscordInstall({ ownerId: userId, guild: { id: install.guildId, name: install.guildName } });
    return finish("connected", `Discord connected: ${install.guildName}`);
  } catch (error) {
    log.warn("Discord install failed", error instanceof Error ? error.message : error);
    return finish("error", error instanceof Error && /^(Discord|This account)/.test(error.message) ? error.message : "Could not connect Discord");
  }
}
