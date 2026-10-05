import { type NextRequest, NextResponse } from "next/server";
import { allowedEmailDomains, isAuthConfigured } from "@/lib/auth/config";
import { isAllowedEmail } from "@/lib/auth/policy";
import { getAuth } from "@/lib/auth/server";

/**
 * Every page and API route requires a signed-in Crocobet employee. Signed-out
 * visitors go to /sign-in (and come back to where they were); API calls get
 * a 401. The sign-in page, the auth endpoints and static files are public.
 * /api/cron routes check their own secret instead.
 */
export async function proxy(request: NextRequest) {
  const session = isAuthConfigured()
    ? await getAuth()
        .api.getSession({ headers: request.headers })
        .catch(() => null)
    : null;

  if (session && isAllowedEmail(session.user.email, allowedEmailDomains())) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
  }

  const signIn = new URL("/sign-in", request.url);
  if (pathname !== "/" || search)
    signIn.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|sign-in|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
