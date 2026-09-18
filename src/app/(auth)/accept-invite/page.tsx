import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInviteForm, Heading } from "@/components/auth/auth-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_META } from "@/lib/auth/permissions";
import { verifyToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Accept your invitation" };

function Expired({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <Heading title={title} subtitle={subtitle} />
      <Button asChild size="lg" className="w-full"><Link href="/login">Go to sign in</Link></Button>
    </>
  );
}

export default async function AcceptInvitePage({ searchParams }: PageProps<"/accept-invite">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const claims = verifyToken("invite", token);
  if (!claims) return <Expired title="This invitation has expired" subtitle="Invitations last seven days. Ask a BGS administrator to send you a new one." />;

  const admin = createAdminClient();
  const [{ data: auth }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(claims.subject),
    admin.from("profiles").select("full_name, role, organization, is_active").eq("id", claims.subject).maybeSingle(),
  ]);

  if (!auth.user?.email || !profile?.is_active) return <Expired title="This invitation was withdrawn" subtitle="Ask a BGS administrator if you still need access." />;
  if (auth.user.app_metadata?.bgs_invite_pending !== true) return <Expired title="You've already joined" subtitle="This invitation has been accepted. Sign in with the password you chose." />;

  const role = ROLE_META[profile.role];
  return (
    <>
      <Heading title="Join the summit team" subtitle="Set your password to open the BGS Dashboard." />
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 text-[13px]">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            You&apos;re joining as <Badge tone="accent">{role.label}</Badge>
            {profile.organization && <span className="text-ink-3">· {profile.organization}</span>}
          </p>
          <p className="mt-0.5 text-ink-3">{role.summary}</p>
        </div>
      </div>
      <AcceptInviteForm token={token} name={profile.full_name} email={auth.user.email} />
    </>
  );
}
