import { blueskyClientMetadata } from "@/lib/channels/bluesky-oauth";
import { json } from "@/lib/http";
import { publicUrl } from "@/lib/env";

/** Bluesky's servers read this to learn who Recatch is. The address of this file is Recatch's client id. */
export async function GET() {
  const origin = publicUrl();
  if (!origin) return json({ error: "PUBLIC_URL is not set" }, 503);
  return new Response(JSON.stringify(blueskyClientMetadata(origin)), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
