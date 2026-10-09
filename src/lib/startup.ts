import { getDb } from "@/lib/db";
import { startWorker } from "@/lib/worker";
import { shouldRunWorker } from "@/lib/queue";
import { log } from "@/lib/logger";

export async function ensureReady() {
  await getDb();
  if (shouldRunWorker()) {
    startWorker();
    const { startDiscordGateways } = await import("@/lib/channels/discord-manager");
    startDiscordGateways();
  }
  log.info("Recatch ready");
}
