/**
 * OAuth providers a user can connect to Recatch, beyond the messaging channels. Each one is plain
 * configuration plus three small calls: build the sign-in URL, trade the code for tokens, read who
 * signed in. Fetch is injected so the logic is tested without the network.
 */
export type ProviderId = "google" | "tiktok";
export const PROVIDER_IDS: ProviderId[] = ["google", "tiktok"];

type Fetcher = typeof fetch;

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scopes: string;
  /** Stable account id the provider returns with the tokens, when it does (TikTok open_id). */
  externalId: string | null;
};

export type Profile = { externalId: string; displayName: string | null; avatarUrl: string | null };

type ProviderConfig = {
  id: ProviderId;
  label: string;
  /** What connecting it gives the business, in one line. */
  purpose: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** TikTok calls the id `client_key`, everyone else `client_id`. */
  clientIdParam: "client_id" | "client_key";
  scopes: string[];
  scopeSeparator: " " | ",";
  pkce: boolean;
  extraAuthorizeParams: Record<string, string>;
  idEnv: string;
  secretEnv: string;
};

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  google: {
    id: "google",
    label: "YouTube",
    purpose: "Read the connected channel's details and comments.",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdParam: "client_id",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    scopeSeparator: " ",
    pkce: true,
    // offline + consent make Google return a refresh token every time, not only the first.
    extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
    idEnv: "GOOGLE_CLIENT_ID",
    secretEnv: "GOOGLE_CLIENT_SECRET",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    purpose: "Sign in with TikTok and read the account's public profile.",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdParam: "client_key",
    scopes: ["user.info.basic"],
    scopeSeparator: ",",
    pkce: false,
    extraAuthorizeParams: {},
    idEnv: "TIKTOK_CLIENT_KEY",
    secretEnv: "TIKTOK_CLIENT_SECRET",
  },
};

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

export function isProviderId(value: string | null | undefined): value is ProviderId {
  return Boolean(value && value in PROVIDERS);
}

function credentials(id: ProviderId): { clientId: string; clientSecret: string } | null {
  const config = PROVIDERS[id];
  const clientId = process.env[config.idEnv]?.trim();
  const clientSecret = process.env[config.secretEnv]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** True when this server has the provider's client id and secret, so Connect can work. */
export function providerConfigured(id: ProviderId): boolean {
  return credentials(id) !== null;
}

export function callbackUrl(origin: string, id: ProviderId): string {
  return `${origin.replace(/\/$/, "")}/api/connections/${id}/callback`;
}

export function buildAuthorizeUrl(id: ProviderId, input: { redirectUri: string; state: string; challenge?: string | null }): string {
  const config = PROVIDERS[id];
  const creds = credentials(id);
  if (!creds) throw new OAuthError(`${config.label} is not set up on this server`);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set(config.clientIdParam, creds.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(config.scopeSeparator));
  url.searchParams.set("state", input.state);
  for (const [key, value] of Object.entries(config.extraAuthorizeParams)) url.searchParams.set(key, value);
  if (config.pkce && input.challenge) {
    url.searchParams.set("code_challenge", input.challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

type RawTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  open_id?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(id: ProviderId, params: Record<string, string>, fetcher: Fetcher, now: number): Promise<TokenSet> {
  const config = PROVIDERS[id];
  const creds = credentials(id);
  if (!creds) throw new OAuthError(`${config.label} is not set up on this server`);
  const body = new URLSearchParams({ [config.clientIdParam]: creds.clientId, client_secret: creds.clientSecret, ...params });
  const response = await fetcher(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as RawTokens;
  // TikTok reports some failures with a 200 status, so look at the body, not only the status.
  if (!response.ok || data.error || !data.access_token) {
    throw new OAuthError(`${config.label} refused the request${data.error_description ? `: ${data.error_description}` : data.error ? `: ${data.error}` : ""}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: typeof data.expires_in === "number" ? new Date(now + data.expires_in * 1000) : null,
    refreshExpiresAt: typeof data.refresh_expires_in === "number" ? new Date(now + data.refresh_expires_in * 1000) : null,
    scopes: (data.scope ?? "").split(/[ ,]+/).filter(Boolean).join(" "),
    externalId: data.open_id ?? null,
  };
}

export function exchangeCode(
  id: ProviderId,
  input: { code: string; redirectUri: string; verifier?: string | null },
  fetcher: Fetcher = fetch,
  now = Date.now(),
): Promise<TokenSet> {
  const params: Record<string, string> = { code: input.code, grant_type: "authorization_code", redirect_uri: input.redirectUri };
  if (PROVIDERS[id].pkce && input.verifier) params.code_verifier = input.verifier;
  return tokenRequest(id, params, fetcher, now);
}

/** New tokens from a refresh token. Google keeps the same refresh token, so the caller keeps its old one. */
export function refreshTokens(id: ProviderId, refreshToken: string, fetcher: Fetcher = fetch, now = Date.now()): Promise<TokenSet> {
  return tokenRequest(id, { grant_type: "refresh_token", refresh_token: refreshToken }, fetcher, now);
}

type TikTokUser = { data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } }; error?: { code?: string; message?: string } };
type YouTubeChannels = { items?: { id?: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } } }[] };

/** Who just signed in: the account id and name shown on the connection. */
export async function fetchProfile(id: ProviderId, tokens: TokenSet, fetcher: Fetcher = fetch): Promise<Profile> {
  const headers = { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" };
  if (id === "tiktok") {
    const response = await fetcher("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", { headers });
    const data = (await response.json().catch(() => ({}))) as TikTokUser;
    const user = data.data?.user;
    const externalId = user?.open_id ?? tokens.externalId;
    if (!response.ok || (data.error?.code && data.error.code !== "ok") || !externalId) {
      throw new OAuthError(`TikTok did not return the account${data.error?.message ? `: ${data.error.message}` : ""}`);
    }
    return { externalId, displayName: user?.display_name ?? null, avatarUrl: user?.avatar_url ?? null };
  }
  const response = await fetcher("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers });
  const data = (await response.json().catch(() => ({}))) as YouTubeChannels;
  const channel = data.items?.[0];
  if (!response.ok) throw new OAuthError("YouTube did not return the channel");
  if (!channel?.id) throw new OAuthError("That Google account has no YouTube channel");
  return { externalId: channel.id, displayName: channel.snippet?.title ?? null, avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null };
}
