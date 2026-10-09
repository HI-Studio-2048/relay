import { requireUserId } from "@/lib/auth";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";
import { type RouteParams } from "@/lib/http";
import { createPkce, createState, VERIFIER_COOKIE } from "@/lib/oauth/state";
import { buildAuthorizeUrl, callbackUrl, isProviderId, PROVIDERS, providerConfigured } from "@/lib/oauth/providers";

function back(origin: string, error: string) {
  const url = new URL("/channels", origin);
  url.searchParams.set("error", error);
  return Response.redirect(url.toString(), 303);
}

/** Send the signed-in user to the provider's consent screen. */
export async function GET(request: Request, context: RouteParams<{ provider: string }>) {
  const { provider } = await context.params;
  const origin = publicUrl(request.url) ?? new URL(request.url).origin;
  if (!isProviderId(provider)) return back(origin, "Unknown app");
  const config = PROVIDERS[provider];
  if (!providerConfigured(provider)) return back(origin, `${config.label} is not set up on this server yet`);
  try {
    const userId = await requireUserId();
    const pkce = config.pkce ? createPkce() : null;
    const target = buildAuthorizeUrl(provider, {
      redirectUri: callbackUrl(origin, provider),
      state: createState(userId, provider),
      challenge: pkce?.challenge,
    });
    const headers = new Headers({ location: target });
    if (pkce) {
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      headers.append("set-cookie", `${VERIFIER_COOKIE}=${pkce.verifier}; Path=/api/connections; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
    }
    return new Response(null, { status: 303, headers });
  } catch (error) {
    log.warn("OAuth start failed", error instanceof Error ? error.message : error);
    return back(origin, `Could not start the ${config.label} sign-in`);
  }
}
