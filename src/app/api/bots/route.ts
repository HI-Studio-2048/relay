import { connectChannelAccount, listBots } from "@/lib/bots";
import { CHANNEL_IDS, type ChannelId } from "@/lib/channels/types";
import { json, fail, readJson } from "@/lib/http";

export async function GET() {
  try {
    return json({ bots: await listBots() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      channel?: string;
      token?: string;
      externalAccountId?: string;
      appSecret?: string;
      verifyToken?: string;
    }>(request);
    const channel = (body.channel ?? "telegram") as ChannelId;
    if (!CHANNEL_IDS.includes(channel)) return json({ error: `Unknown channel "${body.channel}"` }, 400);
    if (!body.token?.trim()) {
      return json(
        { error: channel === "telegram" ? "Paste a bot token from @BotFather" : "Paste the access token" },
        400,
      );
    }
    const bot = await connectChannelAccount({
      channel,
      token: body.token,
      externalAccountId: body.externalAccountId ?? null,
      appSecret: body.appSecret ?? null,
      verifyToken: body.verifyToken ?? null,
      origin: request.url,
    });
    return json({ bot });
  } catch (error) {
    return fail(error, "Could not connect account");
  }
}
