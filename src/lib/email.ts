import { createHash, createHmac } from "node:crypto";
import { log } from "@/lib/logger";

/**
 * Transactional email through Amazon SES (v2 API). Signed with SigV4 over fetch, so there is no AWS SDK
 * to install. Everything that sends mail checks `emailConfigured()` first and carries on without it.
 */
const SERVICE = "ses";

type SesConfig = { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string; from: string; replyTo?: string };

function config(): SesConfig | null {
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY?.trim();
  const region = process.env.AWS_SES_REGION?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!accessKeyId || !secretAccessKey || !region || !from) return null;
  return {
    accessKeyId,
    secretAccessKey,
    region,
    from,
    sessionToken: process.env.AWS_SES_SESSION_TOKEN?.trim() || undefined,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined,
  };
}

export function emailConfigured() {
  return config() !== null;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();

/** AWS Signature Version 4 for one JSON POST. Exported so a test can pin the signature. */
export function signRequest(input: {
  host: string;
  path: string;
  body: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  now?: Date;
}): Record<string, string> {
  const amzDate = (input.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: input.host,
    "x-amz-date": amzDate,
    ...(input.sessionToken ? { "x-amz-security-token": input.sessionToken } : {}),
  };
  const names = Object.keys(headers).sort();
  const canonical = [
    "POST",
    input.path,
    "",
    ...names.map((name) => `${name}:${headers[name]}`),
    "",
    names.join(";"),
    sha256(input.body),
  ].join("\n");
  const scope = `${day}/${input.region}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), SERVICE), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const { host: _host, ...sent } = headers;
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

export type EmailInput = { to: string; subject: string; text: string; html?: string };

/** Returns false (and logs why) rather than throwing, so a mail problem never breaks signup or a hand-off. */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  const host = `email.${cfg.region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const body = JSON.stringify({
    FromEmailAddress: cfg.from,
    Destination: { ToAddresses: [input.to] },
    ...(cfg.replyTo ? { ReplyToAddresses: [cfg.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: input.text, Charset: "UTF-8" },
          ...(input.html ? { Html: { Data: input.html, Charset: "UTF-8" } } : {}),
        },
      },
    },
  });
  try {
    const response = await fetch(`https://${host}${path}`, {
      method: "POST",
      headers: signRequest({ host, path, body, region: cfg.region, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, sessionToken: cfg.sessionToken }),
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return true;
    const detail = ((await response.json().catch(() => ({}))) as { message?: string; Message?: string }).message ?? "";
    log.warn(`SES refused an email (${response.status})`, detail.slice(0, 200));
    return false;
  } catch (error) {
    log.warn("Could not reach SES", error instanceof Error ? error.message : error);
    return false;
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

/** One plain, readable layout for every message. `action` becomes a button plus a copy-paste link. */
export function renderEmail(input: { heading: string; paragraphs: string[]; action?: { label: string; url: string } }) {
  const text = [input.heading, "", ...input.paragraphs, ...(input.action ? ["", `${input.action.label}: ${input.action.url}`] : []), "", "Recatch"].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1b1f24">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.heading)}</h1>
${input.paragraphs.map((line) => `<p style="font-size:14px;line-height:1.5;margin:0 0 12px">${escapeHtml(line)}</p>`).join("\n")}
${
  input.action
    ? `<p style="margin:20px 0"><a href="${escapeHtml(input.action.url)}" style="background:#0084ff;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">${escapeHtml(input.action.label)}</a></p>
<p style="font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(input.action.url)}</p>`
    : ""
}
<p style="font-size:12px;color:#6b7280;margin-top:24px">Recatch</p>
</div>`;
  return { text, html };
}
