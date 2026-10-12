import { ResetError, resetPassword } from "@/lib/auth/reset";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";
import { json, fail, readJson } from "@/lib/http";
import { allowAttempt } from "@/lib/rate-limit";

/** POST { token, password }. Sets the new password and signs the person in. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ token?: string; password?: string }>(request);
    if (!body.token || !body.password) return json({ error: "Enter a new password" }, 400);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await allowAttempt(`reset:${ip}`, 20, 60 * 60))) return json({ error: "Too many attempts. Try again later." }, 429);
    const userId = await resetPassword(body.token, body.password);
    const response = json({ ok: true });
    response.headers.append("set-cookie", sessionCookie(createSessionToken(userId)));
    return response;
  } catch (error) {
    if (error instanceof ResetError) return json({ error: error.message }, 400);
    return fail(error, "Could not reset the password");
  }
}
