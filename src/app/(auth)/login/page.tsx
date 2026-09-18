import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Heading, LoginForm } from "@/components/auth/auth-forms";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  // A brand-new workspace has nobody to sign in as (and a misconfigured one can't
  // sign anyone in): send the visitor to /setup, which creates the owner or explains what to fix.
  let needsSetup = false;
  try {
    const { count, error } = await createAdminClient().from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
    needsSetup = Boolean(error) || count === 0;
  } catch {
    needsSetup = true;
  }
  if (needsSetup) redirect("/setup");

  return (
    <>
      <Heading title="Welcome back" subtitle="Sign in to the Boardroom Governance Summit dashboard." />
      {params.reason === "inactive" && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-3 text-[13px] font-medium text-warning-ink">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Your access isn&apos;t active, so you&apos;ve been signed out. Ask a BGS administrator to invite or reactivate you.
        </p>
      )}
      <LoginForm next={next} />
      <p className="mt-8 rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-ink-3">
        Access is by invitation. If you are on the summit team and don&apos;t have an account yet, ask an administrator to invite you.
      </p>
    </>
  );
}
