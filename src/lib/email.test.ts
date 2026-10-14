import { afterEach, describe, expect, it, vi } from "vitest";
import { emailConfigured, renderEmail, sendEmail, signRequest } from "@/lib/email";

// The suppression list lives in the database; email-feedback.integration.test.ts covers it.
vi.mock("@/lib/email-feedback", () => ({ isSuppressed: async () => false }));

const base = {
  host: "email.us-east-1.amazonaws.com",
  path: "/v2/email/outbound-emails",
  body: "{}",
  region: "us-east-1",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  now: new Date("2026-10-12T12:00:00.000Z"),
};

function stubSes() {
  vi.stubEnv("AWS_SES_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SES_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("AWS_SES_REGION", "eu-west-1");
  vi.stubEnv("EMAIL_FROM", "Recatch <hello@recatch.app>");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SigV4 signing", () => {
  it("is stable for the same request and changes with the body or secret", () => {
    const a = signRequest(base).authorization;
    expect(signRequest(base).authorization).toBe(a);
    expect(signRequest({ ...base, body: "{\"a\":1}" }).authorization).not.toBe(a);
    expect(signRequest({ ...base, secretAccessKey: "other" }).authorization).not.toBe(a);
  });

  it("names the credential scope, the signed headers and the timestamp", () => {
    const headers = signRequest(base);
    expect(headers["x-amz-date"]).toBe("20261012T120000Z");
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261012\/us-east-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it("signs the session token when temporary credentials are used", () => {
    const headers = signRequest({ ...base, sessionToken: "TOKEN" });
    expect(headers["x-amz-security-token"]).toBe("TOKEN");
    expect(headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-date;x-amz-security-token");
  });
});

describe("sendEmail", () => {
  it("does nothing, and says so, when SES is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(emailConfigured()).toBe(false);
    expect(await sendEmail({ to: "a@b.test", subject: "s", text: "t" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a signed SES v2 request to the configured region", async () => {
    stubSes();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail({ to: "a@b.test", subject: "Hello", text: "Plain", html: "<p>Rich</p>" })).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails");
    expect((init.headers as Record<string, string>).authorization).toContain("Credential=AKIDEXAMPLE/");
    expect(JSON.parse(init.body as string)).toMatchObject({
      FromEmailAddress: "Recatch <hello@recatch.app>",
      Destination: { ToAddresses: ["a@b.test"] },
      Content: { Simple: { Subject: { Data: "Hello" }, Body: { Text: { Data: "Plain" }, Html: { Data: "<p>Rich</p>" } } } },
    });
  });

  it("returns false instead of throwing when SES refuses or is unreachable", async () => {
    stubSes();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Email address is not verified." }), { status: 400 })));
    expect(await sendEmail({ to: "a@b.test", subject: "s", text: "t" })).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await sendEmail({ to: "a@b.test", subject: "s", text: "t" })).toBe(false);
  });
});

describe("renderEmail", () => {
  it("escapes HTML and keeps the link in both versions", () => {
    const mail = renderEmail({ heading: "Hi <b>", paragraphs: ["a & b"], action: { label: "Go", url: "https://x.test/?a=1&b=2" } });
    expect(mail.html).toContain("Hi &lt;b&gt;");
    expect(mail.html).toContain("a &amp; b");
    expect(mail.text).toContain("Go: https://x.test/?a=1&b=2");
  });
});
