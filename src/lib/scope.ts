/** Sentinel stored in the account cookie when Overview and Live Chat show every channel. */
export const ALL_CHANNELS = "all";

export const BOT_COOKIE = "relay.botId";

/** Last concrete channel, so Flows and the rest keep working while the view is All channels. */
export const FOCUS_COOKIE = "relay.focusBotId";

export type ScopeChoice<T extends { id: string }> = {
  /** Overview and Live Chat combine every channel the workspace owns. */
  aggregate: boolean;
  /** The channel editor pages open. Null only when the workspace has no channels. */
  bot: T | null;
};

/**
 * Cookie `wanted` is a channel id or `all`. Missing, `all`, or a stale id means All channels.
 * A chosen channel wins. While aggregating, editor pages stay on the last concrete channel.
 */
export function resolveScope<T extends { id: string }>(
  bots: T[],
  wanted: string | null | undefined,
  focusWanted: string | null | undefined,
): ScopeChoice<T> {
  if (bots.length === 0) return { aggregate: false, bot: null };
  const focus = bots.find((bot) => bot.id === focusWanted) ?? bots[0]!;
  if (wanted && wanted !== ALL_CHANNELS) {
    const selected = bots.find((bot) => bot.id === wanted);
    if (selected) return { aggregate: false, bot: selected };
  }
  return { aggregate: true, bot: focus };
}
