"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionError, f, run, type ActionResult } from "@/lib/actions";
import { signToken, verifyToken, safeEqual } from "@/lib/crypto";
import { serverEnv, siteUrl } from "@/lib/env";
import { getBrand } from "@/lib/settings";
import { resetEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { recordEvent } from "@/lib/events";
import { provisionUser } from "@/lib/auth/provision";

const password = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

/** Only same-site paths are honoured, so `?next=` can never bounce someone to another domain. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ email: f.email, password: z.string().min(1, "Enter your password.") }).parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(input);
    if (error || !data.user) throw new ActionError("That email and password don't match. Please try again.");

    const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
    if (!profile?.is_active) {
      await supabase.auth.signOut();
      throw new ActionError("Your access isn't active. Ask a BGS administrator to invite or reactivate you.");
    }

    await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", data.user.id);
    redirect(safeNext(formData.get("next")));
  });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const { email } = z.object({ email: f.email }).parse({ email: formData.get("email") });
    const admin = createAdminClient();

    const { data: profile } = await admin.from("profiles").select("id, full_name, is_active").eq("email", email).maybeSingle();
    if (profile?.is_active) {
      const { data } = await admin.auth.admin.getUserById(profile.id);
      if (data.user) {
        // Bound to the account's current state: the link stops working as soon as the password changes.
        const token = signToken("reset", profile.id, 60 * 60, data.user.updated_at ?? "");
        await sendEmail({
          to: email,
          template: "password-reset",
          ...resetEmail({ brand: await getBrand(), name: profile.full_name, resetUrl: `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}` }),
        });
      }
    }
    // Same answer whether or not the address is known, so the form can't be used to discover team members.
    return undefined;
  }, "If that address belongs to a team member, a reset link is on its way.");
}

export async function resetPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ token: z.string().min(1), password }).parse({ token: formData.get("token"), password: formData.get("password") });
    const claims = verifyToken("reset", input.token);
    if (!claims) throw new ActionError("This reset link has expired. Request a new one.");

    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(claims.subject);
    if (!data.user?.email || (data.user.updated_at ?? "") !== (claims.version ?? "")) {
      throw new ActionError("This reset link has already been used. Request a new one.");
    }

    const { error } = await admin.auth.admin.updateUserById(claims.subject, { password: input.password });
    if (error) throw new ActionError(error.message.includes("weak") ? "Choose a stronger password." : "Could not update the password. Please try again.");

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.user.email, password: input.password });
    redirect(signInError ? "/login" : "/");
  });
}

export async function acceptInvite(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ token: z.string().min(1), full_name: f.text(120), password }).parse({
      token: formData.get("token"),
      full_name: formData.get("full_name"),
      password: formData.get("password"),
    });
    const claims = verifyToken("invite", input.token);
    if (!claims) throw new ActionError("This invitation has expired. Ask an administrator to send a new one.");

    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(claims.subject);
    const user = data.user;
    if (!user?.email) throw new ActionError("This invitation is no longer valid.");
    if (user.app_metadata?.bgs_invite_pending !== true) throw new ActionError("This invitation has already been accepted. Sign in instead.");

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: input.password,
      user_metadata: { ...user.user_metadata, full_name: input.full_name },
      app_metadata: { ...user.app_metadata, bgs_invite_pending: false },
    });
    if (error) throw new ActionError("Could not set your password. Please try again.");

    await admin.from("profiles").update({ full_name: input.full_name, last_seen_at: new Date().toISOString() }).eq("id", user.id);

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: input.password });
    if (signInError) redirect("/login");

    await recordEvent({
      actor: { id: user.id, name: input.full_name },
      action: "team.joined",
      category: "team",
      summary: "accepted their invitation and joined the team",
      entity: { type: "profile", id: user.id, label: input.full_name },
      link: "/team",
      audience: "admins",
      tone: "good",
    });
    redirect("/?welcome=1");
  });
}

/** First run only: creates the workspace owner. Refuses as soon as any super admin exists. */
export async function createOwner(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ full_name: f.text(120), email: f.email, password, organization: f.optionalText(120), setup_secret: z.string().optional() }).parse({
      full_name: formData.get("full_name"),
      email: formData.get("email"),
      password: formData.get("password"),
      organization: formData.get("organization"),
      setup_secret: formData.get("setup_secret") ?? undefined,
    });

    const required = serverEnv().setupSecret;
    if (required && !safeEqual(input.setup_secret ?? "", required)) throw new ActionError("The setup code is incorrect.");

    const admin = createAdminClient();
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
    if ((count ?? 0) > 0) throw new ActionError("This workspace already has an owner. Sign in instead.");

    await provisionUser({ email: input.email, password: input.password, fullName: input.full_name, role: "super_admin", organization: input.organization });

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    redirect(signInError ? "/login" : "/?welcome=1");
  });
}
