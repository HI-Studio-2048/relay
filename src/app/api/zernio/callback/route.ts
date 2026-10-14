import { requireUserId } from "@/lib/auth";
import { log } from "@/lib/logger";
import { redirectTo } from "@/lib/http";
import { finishZernioConnect } from "@/lib/zernio-connect";

/** Zernio sends the browser here after the platform's consent screen; we sync and return to Channels. */
export async function GET(request: Request) {
  let key = "error";
  let message = "";
  try {
    const ownerId = await requireUserId();
    const result = await finishZernioConnect({ ownerId, params: new URL(request.url).searchParams, origin: request.url });
    key = result.ok ? "connected" : "error";
    message = result.message;
  } catch (error) {
    log.warn("Meta connect callback failed", error instanceof Error ? error.message : error);
    message = "The account was connected, but Recatch could not sync it. Press Refresh on the Channels page.";
  }
  return redirectTo("/channels", key, message);
}
