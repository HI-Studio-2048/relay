import { createUser } from "@/lib/auth";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";
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
    const response = json({ user });
    response.headers.append("set-cookie", sessionCookie(createSessionToken(user.id)));
    return response;
  } catch (error) {
    return fail(error, "Could not create account");
  }
}
