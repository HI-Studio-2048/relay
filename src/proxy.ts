import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, USER_HEADER, verifySessionToken } from "@/lib/auth/session";

/**
 * Reachable without a session: marketing and auth pages, plus routes called by platforms or API
 * clients, each of which does its own auth (signatures, verify tokens, API keys).
 */
const PUBLIC_PREFIXES = [
  "/welcome",
  "/login",
  "/signup",
  "/api/auth",
  "/api/health",
  "/api/telegram/webhook",
  "/api/meta/webhook",
  "/api/zernio/webhook",
  "/api/stripe/webhook",
  "/api/v1",
  "/go",
  "/widget",
];

/** Uploaded flow media must be fetchable by Meta / Zernio to deliver it; uploads themselves stay private. */
const PUBLIC_GET_PREFIXES = ["/api/media/"];

/** Signed-in visitors skip these and land in their dashboard. */
const AUTH_PAGES = ["/login", "/signup", "/welcome"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userId = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // Never trust a user header sent by the client; only the proxy may set it.
  const forwarded = new Headers(request.headers);
  forwarded.delete(USER_HEADER);
  if (userId) forwarded.set(USER_HEADER, userId);
  const pass = () => NextResponse.next({ request: { headers: forwarded } });

  if (userId) {
    if (AUTH_PAGES.some((prefix) => matches(pathname, prefix))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return pass();
  }

  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/welcome", request.url), { request: { headers: forwarded } });
  }
  if (PUBLIC_PREFIXES.some((prefix) => matches(pathname, prefix))) return pass();
  if (request.method === "GET" && PUBLIC_GET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return pass();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
