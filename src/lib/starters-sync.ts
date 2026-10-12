import { accountFromRow, type BotRow } from "@/lib/channels";
import { GET_STARTED_PAYLOAD, graphPost } from "@/lib/channels/meta";
import { iceBreakerPayload, persistentMenuPayload, readStarters } from "@/lib/starters";

export type SyncResult = { target: string; ok: boolean; error?: string };

async function attempt(target: string, run: () => Promise<unknown>): Promise<SyncResult> {
  try {
    await run();
    return { target, ok: true };
  } catch (error) {
    return { target, ok: false, error: error instanceof Error ? error.message : "failed" };
  }
}

/**
 * Push ice breakers and the persistent menu to every platform the account reaches.
 * Meta: the Messenger Profile API.
 * Telegram uses bot commands instead, which Recatch already syncs from command flows.
 */
export async function syncStarters(bot: BotRow): Promise<SyncResult[]> {
  const starters = readStarters(bot.settings);
  const account = accountFromRow(bot);
  const results: SyncResult[] = [];
  const iceBreakers = iceBreakerPayload(starters.iceBreakers);

  if (account.channel === "instagram") {
    results.push(
      await attempt("instagram", () =>
        graphPost("me/messenger_profile?platform=instagram", account.token, {
          ice_breakers: [{ locale: "default", call_to_actions: iceBreakers }],
        }),
      ),
    );
  }
  if (account.channel === "messenger") {
    results.push(
      await attempt("messenger", () =>
        graphPost("me/messenger_profile", account.token, {
          get_started: { payload: GET_STARTED_PAYLOAD },
          ...(starters.menu.length ? { persistent_menu: persistentMenuPayload(starters.menu) } : {}),
          ...(iceBreakers.length ? { ice_breakers: [{ locale: "default", call_to_actions: iceBreakers }] } : {}),
        }),
      ),
    );
  }
  return results;
}
