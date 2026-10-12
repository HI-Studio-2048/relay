import { discordRequest } from "@/lib/channels/discord";
import { ChannelApiError } from "@/lib/channels/meta";

type Fetcher = typeof fetch;

/**
 * "Add to Discord": one Discord app and bot owned by the company, added to each customer's server. The
 * client id and secret run the install, the bot token is the one connection Recatch holds for every server.
 */
type Creds = { clientId: string; clientSecret: string; botToken: string };

function creds(): Creds | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  return clientId && clientSecret && botToken ? { clientId, clientSecret, botToken } : null;
}

/** True when this server has all three Discord app secrets, so the Add to Discord button can work. */
export function discordInstallConfigured(): boolean {
  return creds() !== null;
}

/** The shared bot's token, or null before it is set. */
export function sharedDiscordToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim() || null;
}

export function sharedDiscordAppId(): string | null {
  return process.env.DISCORD_CLIENT_ID?.trim() || null;
}

export function discordRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/discord/oauth/callback`;
}

/** The bot scope adds the bot to a server; applications.commands lets it offer /chat there. No permissions are needed. */
export function buildDiscordInstallUrl(input: { redirectUri: string; state: string }): string {
  const found = creds();
  if (!found) throw new ChannelApiError("Add to Discord is not set up on this server yet");
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", found.clientId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", "0");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export type DiscordInstall = { guildId: string; guildName: string };

type TokenResponse = { guild?: { id?: string; name?: string }; error?: string; error_description?: string };

/**
 * Trade the code for the server that was chosen. The server id comes from Discord's own answer, never
 * from the address the browser came back with, which anyone could edit to claim someone else's server.
 */
export async function exchangeDiscordInstall(code: string, redirectUri: string, fetcher: Fetcher = fetch): Promise<DiscordInstall> {
  const found = creds();
  if (!found) throw new ChannelApiError("Add to Discord is not set up on this server yet");
  const response = await fetcher("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: found.clientId, client_secret: found.clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.guild?.id) {
    throw new ChannelApiError(`Discord refused the install${data.error_description ? `: ${data.error_description}` : data.error ? `: ${data.error}` : ""}`);
  }
  return { guildId: data.guild.id, guildName: data.guild.name ?? "Discord server" };
}

/** Take the bot out of a server when its owner disconnects it. Best effort: the local copy is deleted either way. */
export async function leaveDiscordGuild(guildId: string) {
  const token = sharedDiscordToken();
  if (!token) return;
  await discordRequest<void>(token, "DELETE", `/users/@me/guilds/${guildId}`).catch(() => undefined);
}
