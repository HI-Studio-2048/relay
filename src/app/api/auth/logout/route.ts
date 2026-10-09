import { NextResponse } from "next/server";
import { clearedSessionCookie } from "@/lib/auth/session";
import { json } from "@/lib/http";

export async function POST() {
  const response = json({ ok: true });
  response.headers.append("set-cookie", clearedSessionCookie());
  return response;
}

/** Clears a stale session (e.g. the user was deleted) and lands on the login page. */
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.headers.append("set-cookie", clearedSessionCookie());
  return response;
}
