import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const signedOut = (pathname: string, method = "GET") => proxy(new NextRequest(`https://recatch.test${pathname}`, { method }));
const isPassedThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("what a signed-out visitor can reach", () => {
  it.each([
    ["Bluesky's client metadata file, which Bluesky's servers fetch", "/api/bluesky/client-metadata.json", "GET"],
    ["Bluesky's public key list", "/api/bluesky/jwks.json", "GET"],
    ["the shared Slack events URL", "/api/slack/events", "POST"],
    ["a Slack app's own webhook", "/api/slack/webhook/abc123", "POST"],
    ["a Meta webhook", "/api/meta/webhook/abc123", "POST"],
    ["the health check", "/api/health", "GET"],
    ["SES bounce and complaint notices from SNS", "/api/email/feedback", "POST"],
    ["the forgot password page", "/forgot-password", "GET"],
    ["the reset password page", "/reset-password", "GET"],
    ["the Recatch billing webhook", "/api/billing/webhook", "POST"],
    ["asking for a reset link", "/api/auth/forgot", "POST"],
    ["setting a new password from a reset link", "/api/auth/reset", "POST"],
  ])("lets through %s", (_what, pathname, method) => {
    expect(isPassedThrough(signedOut(pathname, method))).toBe(true);
  });

  it.each([
    "/api/bluesky/install",
    "/api/bluesky/oauth/callback",
    "/api/slack/install",
    "/api/slack/oauth/callback",
    "/api/discord/install",
    "/api/discord/oauth/callback",
    "/api/channels/capabilities",
    "/api/bots",
    "/api/billing/checkout",
    "/api/billing/portal",
  ])("answers 401 for %s, because it needs a signed-in user", (pathname) => {
    const response = signedOut(pathname);
    expect(isPassedThrough(response)).toBe(false);
    expect(response.status).toBe(401);
  });

  it("does not open up look-alike paths under the two Bluesky files", () => {
    expect(signedOut("/api/bluesky/client-metadata.json.bak").status).toBe(401);
    expect(signedOut("/api/bluesky/jwks").status).toBe(401);
  });
});
