import { eq } from "drizzle-orm";
import { verifySlackSignature, type SlackPayload } from "@/lib/channels/slack";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json } from "@/lib/http";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

type BotRow = typeof bots.$inferSelect;

type Options = {
  /** Signing secret to verify against. Null means none is set yet. */
  secret: string | null;
  /**
   * With no secret set, still echo Slack's one-time URL check. Slack runs it while the app is being
   * created, before its signing secret exists anywhere we could have it. The echo reveals nothing.
   */
  allowUnsignedChallenge?: boolean;
  /** Which connected account this delivery belongs to, or null when it is not one of ours. */
  resolveBot: (payload: SlackPayload) => Promise<BotRow | null>;
};

/** Slack tells us the app was removed. Mark the account so the owner sees it, and stop sending. */
async function markRemoved(bot: BotRow) {
  const db = await getDb();
  await db
    .update(bots)
    .set({ status: "error", lastHealthAt: new Date(), lastHealthError: "Slack says the Recatch app was removed from this workspace. Add it to Slack again to reconnect.", updatedAt: new Date() })
    .where(eq(bots.id, bot.id));
}

/** Which workspace a delivery came from: events carry team_id, button taps carry team. */
export function slackTeamOf(payload: SlackPayload): string | null {
  return payload.team_id ?? payload.team?.id ?? payload.user?.team_id ?? null;
}

/**
 * Events (messages) and Interactivity (button taps) both arrive here. The signature is checked before
 * anything else is read, button taps arrive form-encoded as payload=<json>, and Slack's retries are skipped.
 */
export async function handleSlackPost(request: Request, options: Options): Promise<Response> {
  const raw = await request.text();
  const signed =
    options.secret !== null &&
    verifySlackSignature(options.secret, raw, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"));
  const unsignedChallengeOnly = !signed && options.allowUnsignedChallenge === true && options.secret === null;
  if (!signed && !unsignedChallengeOnly) {
    log.warn("Slack webhook signature mismatch");
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: SlackPayload;
  try {
    const form = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
    payload = JSON.parse(form ? (new URLSearchParams(raw).get("payload") ?? "") : raw) as SlackPayload;
  } catch {
    return json({ error: "Invalid payload" }, 400);
  }

  if (payload.type === "url_verification" && payload.challenge) {
    return new Response(payload.challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  if (unsignedChallengeOnly) return json({ error: "Unauthorized" }, 401);
  // Slack redelivers when we are slow to answer. The event id also dedupes, this just skips the work.
  if (request.headers.get("x-slack-retry-num")) return json({ ok: true });

  const bot = await options.resolveBot(payload);
  if (!bot) return json({ ok: true });

  const eventType = payload.event?.type;
  if (eventType === "app_uninstalled" || eventType === "tokens_revoked") {
    await markRemoved(bot);
    return json({ ok: true });
  }

  const eventId = payload.event_id ?? payload.trigger_id ?? null;
  await enqueueWebhook({ kind: "webhook", botId: bot.id, update: payload, eventId });
  if (shouldRunWorker()) void drainJobs(5);
  return json({ ok: true });
}

/** The connected Slack account for a workspace, when that workspace installed the shared Recatch app. */
export async function botForSlackTeam(teamId: string | null): Promise<BotRow | null> {
  if (!teamId) return null;
  const db = await getDb();
  const rows = await db.select().from(bots);
  return rows.find((row) => row.channel === "slack" && row.settings?.slackTeamId === teamId) ?? null;
}
