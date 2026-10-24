import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/auth/admin-identity";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password"];
// Open to everyone, signed in or not: the parents' FAQ, parent approval
// (/approve, and /a for the short link in texts), family sign-in, and the
// "choose a new password" page from reset emails.
const OPEN_PATHS = ["/parents", "/approve", "/a", "/family/login", "/reset-password"];

/** Renders the normal not-found page with a real 404 status. */
function notFound(req: Request) {
  return NextResponse.rewrite(new URL("/_not-found", req.url), { status: 404 });
}

// Logged-out visitors always land on /login; signed-in users who haven't
// finished their profile are held on /onboarding, and accounts without a date
// of birth on /confirm-age. Pages and actions still
// check the session themselves: this is a routing convenience, not the
// security boundary.
export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  const user = req.auth?.user;

  // The admin area answers 404 to everyone but the admin, before any page
  // renders. The session token is encrypted and signed by the server, so its
  // role can't be edited in the browser; the page and every admin action
  // still re-check the user against the database (lib/auth/admin.ts).
  // Individual chats (/messages/<username>) are the admin's inbox too.
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/messages/")) {
    if (!isAdmin(user ? { id: user.id, role: user.role, email: user.email } : null)) return notFound(req);
  }
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isApi = pathname.startsWith("/api/");
  // Checks its own CRON_SECRET (or the admin) and answers 404 otherwise.
  if (pathname === "/api/cron/scheduled-chapters" || pathname === "/api/cron/family") return NextResponse.next();
  if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  if (!user) {
    if (isPublic) return NextResponse.next();
    if (isApi) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (isPublic) return NextResponse.redirect(new URL("/", req.url));

  if (user.needsSetup && pathname !== "/onboarding" && !isApi) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }
  if (!user.needsSetup && pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (!user.needsSetup && user.needsBirthDate && pathname !== "/confirm-age" && !isApi) {
    return NextResponse.redirect(new URL("/confirm-age", req.url));
  }
  if (!user.needsBirthDate && pathname === "/confirm-age") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
