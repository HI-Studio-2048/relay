import { NextResponse, type NextRequest } from "next/server";
import { adminPassword } from "@/lib/env";
import { safeEqual, signAdminSession } from "@/lib/crypto";

/** Routes called by platforms or API clients; each one does its own auth (signatures, verify tokens, API keys). */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/login",
  "/api/health",
  "/api/telegram/webhook",
  "/api/meta/webhook",
  "/api/zernio/webhook",
  "/api/v1",
  "/go",
  "/widget",
];

/** Uploaded flow media must be fetchable by Meta / Zernio to deliver it; uploads themselves stay private. */
const PUBLIC_GET_PREFIXES = ["/api/media/"];

export function proxy(request: NextRequest) {
  const password = adminPassword();
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }
  if (request.method === "GET" && PUBLIC_GET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("relay_session")?.value;
  const expected = signAdminSession(password);
  if (cookie && safeEqual(cookie, expected)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
