import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie → login. The real checks (valid
// session, active person, permissions) run on the server for every request.
const PUBLIC = [/^\/login(\/|$)/, /^\/setup(\/|$)/, /^\/join(\/|$)/, /^\/reset$/, /^\/api\/join$/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/push\/action$/, /^\/api\/health$/, /^\/api\/setup\/status$/];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  if (!getSessionCookie(request)) {
    if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // the admin panel doesn't exist for anyone but the Pulse administrator
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const { isPlatformAdminRequest } = await import("@/server/admin-gate");
    if (!(await isPlatformAdminRequest(request.headers))) return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|svg|jpg|ico|webp)$).*)"],
};
