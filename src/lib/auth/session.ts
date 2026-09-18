import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, hasRole, type Capability, type Role } from "@/lib/auth/permissions";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;

export type Session = {
  userId: string;
  profile: Profile;
  role: Role;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

type Resolved = { session: Session | null; signedIn: boolean };

const resolve = cache(async (): Promise<Resolved> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { session: null, signedIn: false };

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || !profile.is_active) return { session: null, signedIn: true };

  return { session: { userId, profile, role: profile.role, supabase }, signedIn: true };
});

/**
 * The signed-in, *active* team member for this request (memoised per request).
 * A valid login whose profile is deactivated — or that was never invited — is
 * treated as signed out.
 */
export async function getSession(): Promise<Session | null> {
  return (await resolve()).session;
}

export async function requireSession(): Promise<Session> {
  const { session, signedIn } = await resolve();
  if (session) return session;
  // A live login without an active profile must have its cookie cleared first,
  // otherwise the proxy would send it straight back here.
  redirect(signedIn ? "/auth/signout?reason=inactive" : "/login");
}

/** Page guard: sends people without the role back to the overview. */
export async function requireRole(min: Role): Promise<Session> {
  const session = await requireSession();
  if (!hasRole(session.role, min)) redirect("/?denied=1");
  return session;
}

export class PermissionError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

/** Server Action guard: throws instead of redirecting so the form can show the reason. */
export async function requireCapability(capability: Capability): Promise<Session> {
  const session = await getSession();
  if (!session) throw new PermissionError("Your session has expired. Please sign in again.");
  if (!can(session.role, capability)) throw new PermissionError();
  return session;
}
