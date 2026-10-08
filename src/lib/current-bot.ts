import { cookies } from "next/headers";
import { currentUserId } from "@/lib/auth";
import { listBots } from "@/lib/bots";

export const BOT_COOKIE = "relay.botId";

/**
 * The account the console is working in. ManyChat scopes everything to one channel account at a
 * time; the sidebar switcher stores the choice in a cookie so server pages follow it. Only accounts
 * the signed-in user owns are ever considered.
 */
export async function currentBot() {
  const userId = await currentUserId();
  if (!userId) return null;
  const bots = await listBots(userId);
  if (bots.length === 0) return null;
  const store = await cookies();
  const wanted = store.get(BOT_COOKIE)?.value;
  return bots.find((bot) => bot.id === wanted) ?? bots[0] ?? null;
}
