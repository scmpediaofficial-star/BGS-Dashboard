import "server-only";

import { ActionError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/auth/permissions";

type ProvisionInput = {
  email: string;
  fullName: string;
  role: Role;
  organization?: string | null;
  jobTitle?: string | null;
  /** Set for the workspace owner; invited people choose theirs when they accept. */
  password?: string;
  invitedBy?: string | null;
};

/**
 * Creates the auth user and then writes the profile explicitly.
 *
 * The database trigger on `auth.users` only ever creates a locked, inactive
 * viewer profile (Supabase Auth writes app metadata in a second statement, so
 * a trigger cannot depend on it). Granting a role is therefore always a
 * deliberate, service-role write made here — after the caller has been authorised.
 */
export async function provisionUser(input: ProvisionInput): Promise<{ id: string }> {
  const admin = createAdminClient();
  const invited = !input.password;

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true, // ownership is proven by the emailed invitation link (or by being the installer)
    user_metadata: { full_name: input.fullName },
    app_metadata: { bgs_invite_pending: invited },
  });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) throw new ActionError("Someone with that email address already has an account.");
    console.error("[provision] createUser failed:", error?.message);
    throw new ActionError("Could not create the account. Please try again.");
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    email: input.email,
    full_name: input.fullName,
    role: input.role,
    is_active: true,
    organization: input.organization ?? null,
    job_title: input.jobTitle ?? null,
    invited_by: input.invitedBy ?? null,
    invited_at: invited ? new Date().toISOString() : null,
  });
  if (profileError) {
    // Don't leave a login behind that has no usable profile.
    await admin.auth.admin.deleteUser(data.user.id);
    console.error("[provision] profile upsert failed:", profileError.message);
    throw new ActionError("Could not create the account. Please try again.");
  }

  return { id: data.user.id };
}
