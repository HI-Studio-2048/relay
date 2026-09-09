import { cookies } from "next/headers";
import { listBots } from "@/lib/bots";

export const BOT_COOKIE = "relay.botId";

/**
 * The account the console is working in. ManyChat scopes everything to one channel account at a
 * time; the sidebar switcher stores the choice in a cookie so server pages follow it.
 */
export async function currentBot() {
  const bots = await listBots();
  if (bots.length === 0) return null;
  const store = await cookies();
  const wanted = store.get(BOT_COOKIE)?.value;
  return bots.find((bot) => bot.id === wanted) ?? bots[0] ?? null;
}
