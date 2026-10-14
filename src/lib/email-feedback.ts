import { createPublicKey, verify } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailSuppressions } from "@/lib/db/schema";
import { log } from "@/lib/logger";

/**
 * SES bounce and complaint feedback. SES publishes to an SNS topic, SNS posts here, and an address that
 * hard-bounces or complains goes on `email_suppressions`, which `sendEmail` checks before every send.
 * The SES account is shared with the company's other projects, so a dead address we keep mailing hurts them too.
 */

const normalize = (email: string) => email.trim().toLowerCase();

/** Fails open: if the database can't be read, the mail still goes. */
export async function isSuppressed(email: string): Promise<boolean> {
  try {
    const db = await getDb();
    const [row] = await db.select({ email: emailSuppressions.email }).from(emailSuppressions).where(eq(emailSuppressions.email, normalize(email))).limit(1);
    return Boolean(row);
  } catch (error) {
    log.warn("Could not check the email suppression list", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function suppress(email: string, reason: "bounce" | "complaint", detail?: string) {
  const db = await getDb();
  await db
    .insert(emailSuppressions)
    .values({ email: normalize(email), reason, detail: detail?.slice(0, 500) ?? null })
    .onConflictDoUpdate({ target: emailSuppressions.email, set: { reason, detail: detail?.slice(0, 500) ?? null, createdAt: new Date() } });
}

export type SnsMessage = {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  Signature: string;
  SignatureVersion: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
};

/** Only AWS's own SNS hosts may hand us a certificate or a confirmation link. */
export function isAwsSnsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(url.hostname);
  } catch {
    return false;
  }
}

/** The string SNS signs: chosen keys in a fixed order, each as "Key\nValue\n". */
export function snsStringToSign(message: SnsMessage): string {
  const keys =
    message.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return keys
    .filter((key) => message[key as keyof SnsMessage] !== undefined)
    .map((key) => `${key}\n${message[key as keyof SnsMessage]}\n`)
    .join("");
}

const certificates = new Map<string, string>();

async function signingCertificate(url: string): Promise<string> {
  const cached = certificates.get(url);
  if (cached) return cached;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`SNS certificate fetch failed (${response.status})`);
  const pem = await response.text();
  certificates.set(url, pem);
  return pem;
}

export async function verifySnsMessage(message: SnsMessage): Promise<boolean> {
  if (!isAwsSnsUrl(message.SigningCertURL) || !message.SigningCertURL.endsWith(".pem")) return false;
  const algorithm = message.SignatureVersion === "1" ? "sha1" : message.SignatureVersion === "2" ? "sha256" : null;
  if (!algorithm || !message.Signature) return false;
  try {
    const key = createPublicKey(await signingCertificate(message.SigningCertURL));
    return verify(algorithm, Buffer.from(snsStringToSign(message)), key, Buffer.from(message.Signature, "base64"));
  } catch (error) {
    log.warn("SNS signature check failed", error instanceof Error ? error.message : error);
    return false;
  }
}

export function feedbackTopicArn() {
  return process.env.AWS_SES_SNS_TOPIC_ARN?.trim() || null;
}

type SesFeedback = {
  notificationType?: string;
  eventType?: string;
  bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[] };
  complaint?: { complaintFeedbackType?: string; complainedRecipients?: { emailAddress?: string }[] };
};

/** Apply one SES notification. Soft bounces (mailbox full, out of office) are left alone; SES retries those. */
export async function applySesFeedback(feedback: SesFeedback): Promise<string[]> {
  const kind = feedback.notificationType ?? feedback.eventType;
  const suppressed: string[] = [];
  if (kind === "Bounce" && feedback.bounce?.bounceType === "Permanent") {
    for (const recipient of feedback.bounce.bouncedRecipients ?? []) {
      if (!recipient.emailAddress) continue;
      await suppress(recipient.emailAddress, "bounce", recipient.diagnosticCode ?? feedback.bounce.bounceSubType);
      suppressed.push(normalize(recipient.emailAddress));
    }
  } else if (kind === "Complaint") {
    for (const recipient of feedback.complaint?.complainedRecipients ?? []) {
      if (!recipient.emailAddress) continue;
      await suppress(recipient.emailAddress, "complaint", feedback.complaint?.complaintFeedbackType);
      suppressed.push(normalize(recipient.emailAddress));
    }
  }
  if (suppressed.length) log.info(`Stopped emailing ${suppressed.length} address(es) after an SES ${kind?.toLowerCase()}`);
  return suppressed;
}
