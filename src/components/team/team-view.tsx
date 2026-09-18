"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailPlus, MoreHorizontal, UsersRound } from "lucide-react";
import { changeRole, inviteMember, resendInvite, setMemberActive } from "@/app/(app)/team/actions";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { assignableRoles, canManageUser, ROLE_META, type Role } from "@/lib/auth/permissions";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { formatDate } from "@/lib/utils";

type Member = { id: string; full_name: string; email: string; role: Role; organization: string | null; job_title: string | null;
  is_active: boolean; invited_at: string | null; last_seen_at: string | null; avatar_url: string | null };

export function TeamView({ members }: { members: Member[] }) {
  const { viewer, can } = useViewer();
  useRealtimeRefresh(["profiles"]);
  const params = useSearchParams();
  const [open, setOpen] = useState(() => params.get("invite") === "1" && can("team.manage"));
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [form, setForm] = useState<{ full_name: string; email: string; role: Role; organization: string; job_title: string }>({ full_name: "", email: "", role: "contributor", organization: "", job_title: "" });
  const [invite, inviting] = useAction(inviteMember, { success: ({ delivery }) => delivery === "sent" ? "Invitation sent" : "Invitation created", onSuccess: ({ inviteUrl }) => { setOpen(false); setManualLink(inviteUrl); setForm({ full_name: "", email: "", role: "contributor", organization: "", job_title: "" }); } });
  const [setRole] = useAction(changeRole, { success: "Role updated" });
  const [setActive] = useAction(setMemberActive);
  const [resend] = useAction(resendInvite, { success: ({ delivery }) => delivery === "sent" ? "Invitation resent" : "Invite link ready", onSuccess: ({ inviteUrl }) => setManualLink(inviteUrl) });
  const active = members.filter((m) => m.is_active).length;

  return <>
    <PageHeader eyebrow="Workspace" title="Team & roles" description={`${active} active team members. Invite colleagues, assign access and manage their accounts.`}
      actions={<Button onClick={() => setOpen(true)}><MailPlus /> Invite member</Button>} />
    <Card className="overflow-hidden">
      {members.length === 0 ? <EmptyState icon={UsersRound} title="No team members yet" description="Invite your first colleague to work on the summit." /> : <>
        <div className="divide-y divide-line md:hidden">{members.map((member) => {
          const manageable = member.id !== viewer.id && canManageUser(viewer.role, member.role);
          return <div key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-4">
            <div className="flex min-w-0 flex-1 items-center gap-3"><Avatar name={member.full_name} src={member.avatar_url} size="sm" /><div className="min-w-0"><p className="truncate text-[13px] font-bold text-ink">{member.full_name}{member.id === viewer.id && <span className="ml-1 text-ink-3">(you)</span>}</p><p className="truncate text-xs text-ink-3">{member.email}</p></div></div>
            <Badge tone={member.role === "super_admin" ? "gold" : member.role === "admin" ? "accent" : "neutral"}>{ROLE_META[member.role].label}</Badge>
            <div className="flex items-center gap-2"><Badge tone={member.is_active ? "good" : "warning"}>{member.is_active ? "Active" : "Inactive"}</Badge></div>
            {manageable ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Manage ${member.full_name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              <DropdownMenuLabel>Manage {member.full_name}</DropdownMenuLabel>
              {assignableRoles(viewer.role).filter((role) => role !== member.role).map((role) => <DropdownMenuItem key={role} onSelect={() => setRole(member.id, role)}>Make {ROLE_META[role].label}</DropdownMenuItem>)}
              <DropdownMenuSeparator />
              {member.invited_at && !member.last_seen_at && <DropdownMenuItem onSelect={() => resend(member.id)}>Resend invitation</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setActive(member.id, !member.is_active)}>{member.is_active ? "Deactivate access" : "Reactivate access"}</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu> : <span />}
            <p className="w-full pl-11 text-[11px] text-ink-3">{member.organization || "No organisation"} · {member.last_seen_at ? `Last seen ${formatDate(member.last_seen_at)}` : "Not signed in yet"}</p>
          </div>;
        })}</div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed text-left"><colgroup><col className="w-[35%]" /><col className="w-[25%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[6%]" /></colgroup><thead className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-ink-3"><tr><th scope="col" className="px-5 py-3">Person</th><th scope="col" className="px-3 py-3">Organisation</th><th scope="col" className="px-3 py-3">Role</th><th scope="col" className="px-3 py-3">Access</th><th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-line">{members.map((member) => {
          const manageable = member.id !== viewer.id && canManageUser(viewer.role, member.role);
          return <tr key={member.id}><th scope="row" className="px-5 py-4 font-normal"><div className="flex min-w-0 items-center gap-3"><Avatar name={member.full_name} src={member.avatar_url} size="sm" /><div className="min-w-0"><p className="truncate text-[13px] font-bold text-ink">{member.full_name}{member.id === viewer.id && <span className="ml-1 text-ink-3">(you)</span>}</p><p className="truncate text-xs text-ink-3">{member.email}</p></div></div></th><td className="truncate px-3 py-4 text-xs text-ink-2">{member.organization || "—"}</td><td className="px-3 py-4"><Badge tone={member.role === "super_admin" ? "gold" : member.role === "admin" ? "accent" : "neutral"}>{ROLE_META[member.role].label}</Badge></td><td className="px-3 py-4"><Badge tone={member.is_active ? "good" : "warning"}>{member.is_active ? "Active" : "Inactive"}</Badge></td><td className="px-3 py-4">{manageable && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Manage ${member.full_name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Manage {member.full_name}</DropdownMenuLabel>{assignableRoles(viewer.role).filter((role) => role !== member.role).map((role) => <DropdownMenuItem key={role} onSelect={() => setRole(member.id, role)}>Make {ROLE_META[role].label}</DropdownMenuItem>)}<DropdownMenuSeparator />{member.invited_at && !member.last_seen_at && <DropdownMenuItem onSelect={() => resend(member.id)}>Resend invitation</DropdownMenuItem>}<DropdownMenuItem onSelect={() => setActive(member.id, !member.is_active)}>{member.is_active ? "Deactivate access" : "Reactivate access"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</td></tr>;
        })}</tbody></table></div>
      </>}
    </Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Invite a team member" description="They will receive a BGS email with a personal link to set their password." footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button form="invite-form" type="submit" loading={inviting}>Send invitation</Button></>}>
      <form id="invite-form" className="grid gap-4" onSubmit={(event) => { event.preventDefault(); invite(form); }}>
        <Field label="Full name" htmlFor="invite-name"><Input id="invite-name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label="Email address" htmlFor="invite-email"><Input id="invite-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Role" htmlFor="invite-role"><Select id="invite-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{assignableRoles(viewer.role).map((role) => <option key={role} value={role}>{ROLE_META[role].label} — {ROLE_META[role].summary}</option>)}</Select></Field>
        <Field label="Organisation" htmlFor="invite-org" optional><Input id="invite-org" value={form.organization ?? ""} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></Field>
        <Field label="Job title" htmlFor="invite-title" optional><Input id="invite-title" value={form.job_title ?? ""} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></Field>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!manualLink} onOpenChange={(value) => { if (!value) setManualLink(null); }}><DialogContent title="Share the invitation link" description="Email delivery is not available. Copy this personal link and send it to the invited member securely." footer={<Button onClick={() => { if (manualLink) navigator.clipboard.writeText(manualLink); }}>Copy link</Button>}><Field label="Invitation link" htmlFor="manual-invite-link"><Input id="manual-invite-link" readOnly value={manualLink ?? ""} onFocus={(e) => e.currentTarget.select()} /></Field></DialogContent></Dialog>
  </>;
}
