import { createUser } from "@/lib/auth";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";
import { emailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { publicUrl } from "@/lib/env";
import { json, fail, readJson } from "@/lib/http";
import { allowAttempt } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ name?: string; email?: string; password?: string }>(request);
    if (!body.email?.trim() || !body.password) return json({ error: "Enter your email and a password" }, 400);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await allowAttempt(`signup:${ip}`, 5, 60 * 60))) {
      return json({ error: "Too many sign-ups from this network. Try again later." }, 429);
    }
    const user = await createUser({ name: body.name, email: body.email, password: body.password });
    if (emailConfigured()) {
      const origin = publicUrl();
      const mail = renderEmail({
        heading: user.name ? `Welcome to Recatch, ${user.name}` : "Welcome to Recatch",
        paragraphs: ["Your workspace is ready. Connect a channel and your first automation can be live in a few minutes."],
        ...(origin ? { action: { label: "Open Recatch", url: `${origin}/setup` } } : {}),
      });
      void sendEmail({ to: user.email, subject: "Welcome to Recatch", ...mail });
    }
    const response = json({ user });
    response.headers.append("set-cookie", sessionCookie(createSessionToken(user.id)));
    return response;
  } catch (error) {
    return fail(error, "Could not create account");
  }
}
