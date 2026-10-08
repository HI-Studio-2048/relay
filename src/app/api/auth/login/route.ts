import { authenticate } from "@/lib/auth";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";
import { json, fail, readJson } from "@/lib/http";
import { allowAttempt } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: string; password?: string }>(request);
    if (!body.email?.trim() || !body.password) return json({ error: "Enter your email and password" }, 400);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await allowAttempt(`login:${ip}:${body.email.trim().toLowerCase()}`, 10, 15 * 60))) {
      return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    }
    const user = await authenticate(body.email, body.password);
    const response = json({ user });
    response.headers.append("set-cookie", sessionCookie(createSessionToken(user.id)));
    return response;
  } catch (error) {
    return fail(error, "Login failed");
  }
}
