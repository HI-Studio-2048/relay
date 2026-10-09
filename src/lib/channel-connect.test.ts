import { describe, expect, it } from "vitest";
import { connectCallbackUrl, finishChannelConnect } from "@/lib/channel-connect";

describe("channel connect callback", () => {
  it("turns Zernio's error redirect into a readable message without touching the account", async () => {
    const params = new URLSearchParams({ error: "access_denied", platform: "twitter", error_message: "You cancelled the connection." });
    await expect(finishChannelConnect({ botId: "missing", params, origin: "http://x.test/" })).resolves.toEqual({
      ok: false,
      platform: "twitter",
      message: "X wasn't connected: You cancelled the connection.",
    });
    const bare = new URLSearchParams({ error: "missing_tiktok_permissions", platform: "tiktok" });
    expect((await finishChannelConnect({ botId: "missing", params: bare, origin: "http://x.test/" })).message).toBe(
      "TikTok wasn't connected: missing tiktok permissions",
    );
  });

  it("treats a redirect with no account id as not connected", async () => {
    const result = await finishChannelConnect({ botId: "missing", params: new URLSearchParams({ connected: "instagram" }), origin: "http://x.test/" });
    expect(result.ok).toBe(false);
  });

  it("builds an absolute callback URL", () => {
    const previous = process.env.PUBLIC_URL;
    delete process.env.PUBLIC_URL;
    expect(connectCallbackUrl("b1", "https://relay.test/api/x")).toBe("https://relay.test/api/bots/b1/channels/callback");
    process.env.PUBLIC_URL = previous;
  });
});
