import { clearedSessionCookie } from "@/lib/auth/session";
import { json, redirectTo } from "@/lib/http";

export async function POST() {
  const response = json({ ok: true });
  response.headers.append("set-cookie", clearedSessionCookie());
  return response;
}

/** Clears a stale session (e.g. the user was deleted) and lands on the login page. */
export async function GET() {
  const response = redirectTo("/login");
  response.headers.append("set-cookie", clearedSessionCookie());
  return response;
}
