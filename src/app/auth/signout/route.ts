import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const REASONS = new Set(["inactive"]);

/**
 * Clears the session cookie, then lands on /login.
 * Server Components can't write cookies, so a deactivated (or never-invited)
 * account that still holds a valid login is sent here instead of straight to
 * /login — which would bounce it back and loop.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  const url = new URL("/login", request.url);
  const reason = request.nextUrl.searchParams.get("reason");
  if (reason && REASONS.has(reason)) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}
