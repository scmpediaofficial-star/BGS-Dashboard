import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

/** Routes that render without a session. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/accept-invite", "/setup", "/offline", "/virtual-access", "/auth"];

/**
 * Refreshes the Supabase session cookie on every request and performs the
 * optimistic signed-out redirect. Real authorisation happens again in
 * `requireSession()` and in Postgres row-level security.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured) {
    if (pathname === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not run code between createServerClient and getClaims: it is what keeps
  // the refresh-token rotation in step with the cookies written above.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  if (signedIn && (pathname === "/login" || pathname === "/forgot-password")) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static files, PWA plumbing and machine endpoints (which authenticate themselves).
    "/((?!_next/static|_next/image|api/cron|api/health|brand/|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico|icon\\.png|apple-icon\\.png|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
