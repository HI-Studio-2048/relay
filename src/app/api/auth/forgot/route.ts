import { resetTokenFor } from "@/lib/auth/reset";
import { emailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { publicUrl } from "@/lib/env";
import { json, fail, readJson } from "@/lib/http";
import { log } from "@/lib/logger";
import { allowAttempt } from "@/lib/rate-limit";

const SAME_ANSWER = { ok: true, message: "If that email has an account, a reset link is on its way." };

/** POST { email }. Answers the same way whether or not the account exists, so emails cannot be probed. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: string }>(request);
    const email = body.email?.trim().toLowerCase();
    if (!email) return json({ error: "Enter your email" }, 400);
    if (!emailConfigured()) return json({ error: "Password reset email is not set up on this server yet" }, 503);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await allowAttempt(`forgot:${ip}`, 10, 60 * 60)) || !(await allowAttempt(`forgot:${email}`, 3, 60 * 60))) {
      return json({ error: "Too many requests. Try again later." }, 429);
    }
    const found = await resetTokenFor(email);
    const origin = publicUrl();
    if (found && origin) {
      const mail = renderEmail({
        heading: "Reset your Recatch password",
        paragraphs: ["Someone asked to reset the password for this account. The link works for one hour and only once.", "If it was not you, ignore this email and nothing changes."],
        action: { label: "Choose a new password", url: `${origin}/reset-password?token=${encodeURIComponent(found.token)}` },
      });
      await sendEmail({ to: found.email, subject: "Reset your Recatch password", ...mail });
    } else if (found) {
      log.warn("Password reset skipped: PUBLIC_URL is not set");
    }
    return json(SAME_ANSWER);
  } catch (error) {
    return fail(error, "Could not send the reset email");
  }
}
