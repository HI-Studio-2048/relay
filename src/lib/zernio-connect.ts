import { requireZernioKey, syncZernioBot, zernioProfileFor } from "@/lib/bots";
import { listZernioAccounts, zernioConnectUrl, zernioPlatformMeta, type ZernioConnectable } from "@/lib/channels/zernio";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";

export class ChannelConnectError extends Error {}

/** Where Zernio sends people back after the platform's consent screen. */
export function connectCallbackUrl(origin: string) {
  return `${publicUrl(origin) ?? new URL(origin).origin}/api/zernio/callback`;
}

/**
 * Start connecting Instagram, Messenger or WhatsApp: returns the consent-screen URL to send the browser to.
 * The account lands in the signed-in user's own Zernio profile. `reconnectAccountId` refreshes an account
 * Zernio lost access to, and must belong to that profile.
 */
export async function startZernioConnect(input: { ownerId: string; platform: ZernioConnectable; origin: string; reconnectAccountId?: string | null }) {
  const apiKey = requireZernioKey();
  const profileId = await zernioProfileFor(input.ownerId);
  if (input.reconnectAccountId) {
    const linked = (await listZernioAccounts(apiKey, profileId)).find((account) => account._id === input.reconnectAccountId);
    if (!linked || linked.platform !== input.platform) throw new ChannelConnectError("That account isn't connected here");
  }
  return zernioConnectUrl(apiKey, {
    platform: input.platform,
    profileId,
    redirectUrl: connectCallbackUrl(input.origin),
    reconnectAccountId: input.reconnectAccountId ?? null,
  });
}

/**
 * Zernio redirected back. Nothing in the address is trusted beyond the message to show: the account list is
 * read again from Zernio for this user's profile.
 */
export async function finishZernioConnect(input: { ownerId: string; params: URLSearchParams; origin: string }) {
  const { params } = input;
  const platform = params.get("connected") ?? params.get("platform") ?? "";
  const label = zernioPlatformMeta(platform).label;
  if (params.get("error")) {
    const reason = params.get("error_message") || params.get("error")!.replace(/_/g, " ");
    return { ok: false as const, platform, message: `${label} wasn't connected: ${reason}` };
  }
  // Zernio's success parameters have not matched what we expected (an Instagram account connected in Zernio
  // and never reached Recatch), so read the truth from Zernio unless it reported an error.
  if (!params.get("connected") || !params.get("accountId")) log.info("Zernio callback without connected/accountId; params:", [...params.keys()].join(","));
  const bot = await syncZernioBot(input.ownerId, input.origin);
  if (!bot) return { ok: false as const, platform, message: `${label} wasn't connected. Try again.` };
  const username = params.get("username");
  return { ok: true as const, platform, message: `${label}${username ? ` @${username.replace(/^@/, "")}` : ""} is connected. New DMs and comments will show up in Live Chat.` };
}
