import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie → login. The real checks (valid
// session, active person, permissions) run on the server for every request.
const PUBLIC = [/^\/login(\/|$)/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/push\/action$/, /^\/api\/health$/];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  if (!getSessionCookie(request)) {
    if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|svg|jpg|ico|webp)$).*)"],
};
