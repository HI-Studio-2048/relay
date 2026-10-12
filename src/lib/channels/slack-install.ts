import { ChannelApiError } from "@/lib/channels/meta";

type Fetcher = typeof fetch;

/**
 * "Add to Slack": one Slack app owned by the company that any workspace can install. The client id and
 * secret identify that app, and the signing secret verifies every event it receives, for all workspaces.
 * The bot scopes here must match slack-app-manifest.json.
 */
export const SLACK_BOT_SCOPES = ["chat:write", "im:history", "im:read", "im:write", "users:read"];

type Creds = { clientId: string; clientSecret: string; signingSecret: string };

function creds(): Creds | null {
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  return clientId && clientSecret && signingSecret ? { clientId, clientSecret, signingSecret } : null;
}

/** True when this server has all three Slack app secrets, so the Add to Slack button can work. */
export function slackInstallConfigured(): boolean {
  return creds() !== null;
}

/** The company app's signing secret, or null before it is set. */
export function slackAppSigningSecret(): string | null {
  return process.env.SLACK_SIGNING_SECRET?.trim() || null;
}

export function slackRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/slack/oauth/callback`;
}

export function slackEventsUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/slack/events`;
}

export function buildSlackAuthorizeUrl(input: { redirectUri: string; state: string }): string {
  const found = creds();
  if (!found) throw new ChannelApiError("Add to Slack is not set up on this server yet");
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", found.clientId);
  url.searchParams.set("scope", SLACK_BOT_SCOPES.join(","));
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export type SlackInstall = { accessToken: string; botUserId: string; teamId: string; teamName: string; appId: string | null };

type AccessResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: { id?: string; name?: string };
};

/** Trade the code Slack sent back for the workspace's bot token. */
export async function exchangeSlackCode(code: string, redirectUri: string, fetcher: Fetcher = fetch): Promise<SlackInstall> {
  const found = creds();
  if (!found) throw new ChannelApiError("Add to Slack is not set up on this server yet");
  const response = await fetcher("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: found.clientId, client_secret: found.clientSecret, code, redirect_uri: redirectUri }),
  });
  const data = (await response.json().catch(() => ({ ok: false }))) as AccessResponse;
  if (!data.ok || !data.access_token || !data.bot_user_id || !data.team?.id) {
    throw new ChannelApiError(`Slack refused the install${data.error ? `: ${data.error}` : ""}`);
  }
  return { accessToken: data.access_token, botUserId: data.bot_user_id, teamId: data.team.id, teamName: data.team.name ?? "Slack workspace", appId: data.app_id ?? null };
}

/** Take the app out of a workspace when its owner disconnects it. Best effort: the local copy is deleted either way. */
export async function revokeSlackToken(token: string, fetcher: Fetcher = fetch) {
  await fetcher("https://slack.com/api/auth.revoke", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
}
