import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { snsStringToSign, type SnsMessage } from "@/lib/email-feedback";

const TOPIC = "arn:aws:sns:us-east-1:123456789012:recatch-ses-feedback";
const CERT_URL = "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem";
const SUBSCRIBE_URL = "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=t";

// Stands in for AWS's signing certificate. createPublicKey reads a bare public key PEM as well as a certificate.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;

const fetched: string[] = [];
const realFetch = globalThis.fetch;

function signed(fields: Partial<SnsMessage>, signer = privateKey): SnsMessage {
  const message = {
    Type: "Notification",
    MessageId: "m-1",
    TopicArn: TOPIC,
    Message: "{}",
    Timestamp: "2026-10-14T12:00:00.000Z",
    SignatureVersion: "2",
    SigningCertURL: CERT_URL,
    Signature: "",
    ...fields,
  } as SnsMessage;
  message.Signature = sign("sha256", Buffer.from(snsStringToSign(message)), signer).toString("base64");
  return message;
}

const bounce = (address: string, bounceType = "Permanent") =>
  JSON.stringify({ notificationType: "Bounce", bounce: { bounceType, bounceSubType: "General", bouncedRecipients: [{ emailAddress: address, diagnosticCode: "550 5.1.1 user unknown" }] } });

async function deliver(message: SnsMessage) {
  const { POST } = await import("@/app/api/email/feedback/route");
  return POST(new Request("https://recatch.test/api/email/feedback", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(message) }));
}

describe("SES feedback through SNS", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-email-feedback-")));
    // Start the database in setup (30 seconds), not in the first test (20), so a busy run does not time out.
    await (await import("@/lib/db")).getDb();
    vi.stubEnv("AWS_SES_SNS_TOPIC_ARN", TOPIC);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("amazonaws.com")) return realFetch(input, init);
        fetched.push(url);
        if (url === CERT_URL) return new Response(publicPem);
        if (url === SUBSCRIBE_URL) return new Response("<ConfirmSubscriptionResponse/>");
        return new Response("{}", { status: 200 });
      }),
    );
  });

  beforeEach(() => {
    fetched.length = 0;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("confirms the subscription by visiting SNS's link", async () => {
    const response = await deliver(signed({ Type: "SubscriptionConfirmation", SubscribeURL: SUBSCRIBE_URL, Token: "t", Message: "You have chosen to subscribe" }));
    expect(response.status).toBe(200);
    expect(fetched).toContain(SUBSCRIBE_URL);
  });

  it("stops emailing an address after a hard bounce, and sendEmail skips it", async () => {
    expect((await deliver(signed({ Message: bounce("Gone@Example.test") }))).status).toBe(200);
    const { isSuppressed } = await import("@/lib/email-feedback");
    expect(await isSuppressed("gone@example.test")).toBe(true);

    vi.stubEnv("AWS_SES_ACCESS_KEY_ID", "AKID");
    vi.stubEnv("AWS_SES_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("AWS_SES_REGION", "us-east-1");
    vi.stubEnv("EMAIL_FROM", "hello@recatch.test");
    const { sendEmail } = await import("@/lib/email");
    expect(await sendEmail({ to: "GONE@example.test", subject: "s", text: "t" })).toBe(false);
    expect(fetched.some((url) => url.includes("outbound-emails"))).toBe(false);
    expect(await sendEmail({ to: "fine@example.test", subject: "s", text: "t" })).toBe(true);
  });

  it("leaves soft bounces alone, because SES retries those", async () => {
    await deliver(signed({ Message: bounce("full@example.test", "Transient") }));
    const { isSuppressed } = await import("@/lib/email-feedback");
    expect(await isSuppressed("full@example.test")).toBe(false);
  });

  it("stops emailing someone who marked a message as spam", async () => {
    const complaint = JSON.stringify({ notificationType: "Complaint", complaint: { complaintFeedbackType: "abuse", complainedRecipients: [{ emailAddress: "angry@example.test" }] } });
    await deliver(signed({ Message: complaint }));
    const { isSuppressed } = await import("@/lib/email-feedback");
    expect(await isSuppressed("angry@example.test")).toBe(true);
  });

  it("refuses a validly signed message from someone else's topic", async () => {
    const response = await deliver(signed({ TopicArn: "arn:aws:sns:us-east-1:999999999999:theirs", Message: bounce("victim@example.test") }));
    expect(response.status).toBe(403);
    const { isSuppressed } = await import("@/lib/email-feedback");
    expect(await isSuppressed("victim@example.test")).toBe(false);
  });

  it("refuses a forged signature and a certificate from outside AWS", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    expect((await deliver(signed({ Message: bounce("victim@example.test") }, other))).status).toBe(401);
    expect((await deliver(signed({ Message: bounce("victim@example.test"), SigningCertURL: "https://evil.test/sns.us-east-1.amazonaws.com.pem" }))).status).toBe(401);
    const { isSuppressed } = await import("@/lib/email-feedback");
    expect(await isSuppressed("victim@example.test")).toBe(false);
  });
});
