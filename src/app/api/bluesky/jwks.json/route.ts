import { blueskyOauthConfigured, blueskyPublicJwks } from "@/lib/channels/bluesky-oauth";
import { json } from "@/lib/http";

/** The public half of Recatch's signing key. Never the private half: the library only exposes public keys here. */
export async function GET() {
  if (!blueskyOauthConfigured()) return json({ error: "Sign in with Bluesky is not set up" }, 503);
  return new Response(JSON.stringify(await blueskyPublicJwks()), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
