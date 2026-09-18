"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { assignableRoles, canManageUser, ROLE_META, ROLES } from "@/lib/auth/permissions";
import { provisionUser } from "@/lib/auth/provision";
import { signToken } from "@/lib/crypto";
import { inviteEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/env";
import { recordEvent } from "@/lib/events";
import { getBrand } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  full_name: f.text(120), email: f.email, role: z.enum(ROLES),
  organization: f.optionalText(120), job_title: f.optionalText(120),
});
export type InviteInput = z.input<typeof inviteSchema>;

async function sendInvitation(id: string, email: string, name: string, role: keyof typeof ROLE_META, organization: string | null, inviter: string) {
  const acceptUrl = `${siteUrl()}/accept-invite?token=${encodeURIComponent(signToken("invite", id, 7 * 24 * 60 * 60))}`;
  const result = await sendEmail({
    to: email,
    template: "invitation",
    ...inviteEmail({ brand: await getBrand(), inviteeName: name, inviterName: inviter,
      roleLabel: ROLE_META[role].label, roleSummary: ROLE_META[role].summary, organization, acceptUrl }),
  });
  return { delivery: result.status, inviteUrl: result.status === "sent" ? null : acceptUrl };
}

export async function inviteMember(input: InviteInput): Promise<ActionResult<{ id: string; delivery: string; inviteUrl: string | null }>> {
  return run(async () => {
    const { profile } = await requireCapability("team.manage");
    const data = inviteSchema.parse(input);
    if (!assignableRoles(profile.role).includes(data.role)) throw new ActionError("You cannot assign that role.");
    const created = await provisionUser({ email: data.email, fullName: data.full_name, role: data.role,
      organization: data.organization, jobTitle: data.job_title, invitedBy: profile.id });
    const delivery = await sendInvitation(created.id, data.email, data.full_name, data.role, data.organization ?? null, profile.full_name);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "team.invited", category: "team",
      summary: `invited ${data.full_name} as ${ROLE_META[data.role].label}`, entity: { type: "profile", id: created.id, label: data.full_name },
      link: "/team", audience: "admins", include: [created.id], importance: "high" });
    revalidatePath("/", "layout");
    return { ...created, ...delivery };
  }, "Invitation created");
}

export async function resendInvite(id: string): Promise<ActionResult<{ delivery: string; inviteUrl: string | null }>> {
  return run(async () => {
    const { profile } = await requireCapability("team.manage");
    const target = one(await createAdminClient().from("profiles").select("id, email, full_name, role, organization").eq("id", f.id.parse(id)).single());
    if (!canManageUser(profile.role, target.role)) throw new ActionError("You cannot manage this person.");
    const { data } = await createAdminClient().auth.admin.getUserById(id);
    if (data.user?.app_metadata?.bgs_invite_pending !== true) throw new ActionError("This invitation has already been accepted.");
    const delivery = await sendInvitation(id, target.email, target.full_name, target.role, target.organization, profile.full_name);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "team.invite_resent", category: "team",
      summary: `resent ${target.full_name}'s invitation`, link: "/team", audience: "admins", include: [id], importance: "low" });
    revalidatePath("/", "layout");
    return delivery;
  }, "Invitation resent");
}

export async function changeRole(id: string, role: (typeof ROLES)[number]): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("team.manage");
    const input = z.object({ id: f.id, role: z.enum(ROLES) }).parse({ id, role });
    const admin = createAdminClient();
    const target = one(await admin.from("profiles").select("id, full_name, role").eq("id", input.id).single());
    if (id === profile.id) throw new ActionError("Ask another administrator to change your role.");
    if (!canManageUser(profile.role, target.role) || !assignableRoles(profile.role).includes(input.role)) throw new ActionError("You cannot make that role change.");
    if (target.role === input.role) return undefined;
    check(await admin.from("profiles").update({ role: input.role }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "team.role_changed", category: "team",
      summary: `changed ${target.full_name}'s role from ${ROLE_META[target.role].label} to ${ROLE_META[input.role].label}`,
      entity: { type: "profile", id, label: target.full_name }, link: "/team", audience: "admins", include: [id], importance: "high" });
    revalidatePath("/", "layout");
    return undefined;
  }, "Role updated");
}

export async function setMemberActive(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("team.manage");
    const input = z.object({ id: f.id, active: z.boolean() }).parse({ id, active });
    const admin = createAdminClient();
    const target = one(await admin.from("profiles").select("id, full_name, role, is_active").eq("id", input.id).single());
    if (id === profile.id) throw new ActionError("You cannot change your own access here.");
    if (!canManageUser(profile.role, target.role)) throw new ActionError("You cannot manage this person.");
    if (target.is_active === active) return undefined;
    check(await admin.from("profiles").update({ is_active: active }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: active ? "team.activated" : "team.deactivated", category: "team",
      summary: `${active ? "reactivated" : "deactivated"} ${target.full_name}`, entity: { type: "profile", id, label: target.full_name },
      link: "/team", audience: "admins", include: [id], importance: "high", tone: active ? "good" : "warning" });
    revalidatePath("/", "layout");
    return undefined;
  }, active ? "Member reactivated" : "Member deactivated");
}
