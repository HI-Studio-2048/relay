/** Sentinel stored when Overview and Live Chat are narrowed to one channel on purpose. */
export const ALL_CHANNELS = "all";

/**
 * The channel picker that existed before All channels. It still names the last
 * account someone was editing, but it is not a choice to hide the other channels.
 */
export const BOT_COOKIE = "relay.botId";

/** Last concrete channel, so Flows and the rest keep working while the view is All channels. */
export const FOCUS_COOKIE = "relay.focusBotId";

/**
 * Set only when someone uses the channel switcher. Missing means Overview and
 * Live Chat show every channel, even if `relay.botId` is still a real account.
 */
export const VIEW_COOKIE = "relay.channelView";

/**
 * Only Overview and Live Chat can merge every channel. Every other console page reads
 * and writes one account (`ScopeChoice.bot`), so the switcher there names that account
 * and never says All channels.
 */
export function isAggregatePath(pathname: string) {
  return pathname === "/" || pathname === "/inbox" || pathname.startsWith("/inbox/");
}

export type ScopeChoice<T extends { id: string }> = {
  /** Overview and Live Chat combine every channel the workspace owns. */
  aggregate: boolean;
  /** The channel editor pages open. Null only when the workspace has no channels. */
  bot: T | null;
};

/**
 * `view` is `relay.channelView`. It is empty until someone picks All channels or one
 * channel in the switcher. A stored `relay.botId` is only a fallback for editor pages
 * when `relay.focusBotId` is missing. It does not narrow Overview or Live Chat.
 */
export function resolveScope<T extends { id: string }>(
  bots: T[],
  view: string | null | undefined,
  focusWanted: string | null | undefined,
  legacyBotId?: string | null,
): ScopeChoice<T> {
  if (bots.length === 0) return { aggregate: false, bot: null };
  const legacy = legacyBotId && legacyBotId !== ALL_CHANNELS ? bots.find((bot) => bot.id === legacyBotId) : undefined;
  const focus = bots.find((bot) => bot.id === focusWanted) ?? legacy ?? bots[0]!;
  if (view && view !== ALL_CHANNELS) {
    const selected = bots.find((bot) => bot.id === view);
    if (selected) return { aggregate: false, bot: selected };
  }
  return { aggregate: true, bot: focus };
}

/**
 * What a pick in the switcher changes. With `keepView` (a pick on a single-account page)
 * the account those pages use moves, and Overview and Live Chat stay on All channels if
 * that is where they were. If they were narrowed to one channel, they follow the pick, or
 * `resolveScope` would keep handing out the old channel. The server writes these cookies
 * and `BotProvider` applies the same result to its own state, so both land on one account.
 */
export function applySelection(
  current: { aggregate: boolean },
  choice: string,
  keepView: boolean,
): { aggregate: boolean; view?: string; focus?: string } {
  if (choice === ALL_CHANNELS) return { aggregate: true, view: ALL_CHANNELS };
  if (keepView && current.aggregate) return { aggregate: true, focus: choice };
  return { aggregate: false, view: choice, focus: choice };
}
