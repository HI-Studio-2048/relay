import { cookies } from "next/headers";
import { currentUserId } from "@/lib/auth";
import { listBots } from "@/lib/bots";
import { BOT_COOKIE, FOCUS_COOKIE, resolveScope } from "@/lib/scope";

export { ALL_CHANNELS, BOT_COOKIE, FOCUS_COOKIE } from "@/lib/scope";

/**
 * What the console is showing. The sidebar can be one channel or All channels (the default).
 * Only accounts the signed-in user owns are ever considered. Editor pages still receive one
 * concrete channel (`bot`) when the view is All channels, so Flows and Contacts keep working.
 */
export async function consoleScope() {
  const userId = await currentUserId();
  if (!userId) return { aggregate: false, bot: null, bots: [] as Awaited<ReturnType<typeof listBots>> };
  const bots = await listBots(userId);
  const store = await cookies();
  const choice = resolveScope(bots, store.get(BOT_COOKIE)?.value, store.get(FOCUS_COOKIE)?.value);
  return { ...choice, bots };
}

/** The channel editor pages open. See `consoleScope` for the All-channels view. */
export async function currentBot() {
  return (await consoleScope()).bot;
}
