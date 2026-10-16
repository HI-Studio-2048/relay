import { requireUserId } from "@/lib/auth";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";
import { relativeLocation, type RouteParams } from "@/lib/http";
import { connectYouTubeChannel } from "@/lib/bots";
import { saveConnection } from "@/lib/oauth/connections";
import { callbackUrl, exchangeCode, fetchProfile, isProviderId, PROVIDERS } from "@/lib/oauth/providers";
import { verifyState, VERIFIER_COOKIE } from "@/lib/oauth/state";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index) === name) return part.slice(index + 1);
  }
  return null;
}

function finish(key: "connected" | "error", message: string) {
  const headers = new Headers({ location: relativeLocation("/channels", key, message) });
  headers.append("set-cookie", `${VERIFIER_COOKIE}=; Path=/api/connections; HttpOnly; SameSite=Lax; Max-Age=0`);
  return new Response(null, { status: 303, headers });
}

/** The provider sends the browser back here with a code. Check it is ours, trade it for tokens and save the account. */
export async function GET(request: Request, context: RouteParams<{ provider: string }>) {
  const { provider } = await context.params;
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  if (!isProviderId(provider)) return finish("error", "Unknown app");
  const label = PROVIDERS[provider].label;
  const params = new URL(request.url).searchParams;
  try {
    const userId = await requireUserId();
    if (params.get("error")) return finish("error", `${label} sign-in was cancelled`);
    const check = verifyState(params.get("state"), { userId, provider });
    if (!check.ok) {
      log.warn("OAuth state rejected", check.reason);
      return finish("error", `${label} sign-in could not be verified. Try connecting again.`);
    }
    const code = params.get("code");
    if (!code) return finish("error", `${label} did not send a sign-in code`);
    const tokens = await exchangeCode(provider, {
      code,
      redirectUri: callbackUrl(origin, provider),
      verifier: readCookie(request, VERIFIER_COOKIE),
    });
    const profile = await fetchProfile(provider, tokens);
    const saved = await saveConnection({ ownerId: userId, provider, profile, tokens });
    // A YouTube sign-in is also a channel: its comments come into Live Chat.
    if (provider === "google") await connectYouTubeChannel({ ownerId: userId, connectionId: saved.id, channelId: profile.externalId, title: profile.displayName });
    return finish("connected", `${label} connected${saved.displayName ? `: ${saved.displayName}` : ""}`);
  } catch (error) {
    // The message can come from the provider; it never contains our tokens.
    log.warn("OAuth callback failed", error instanceof Error ? error.message : error);
    return finish("error", error instanceof Error && error.name === "OAuthError" ? error.message : `Could not connect ${label}`);
  }
}
