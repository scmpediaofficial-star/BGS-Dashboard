import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheck, CircleX } from "lucide-react";
import { Heading, SetupForm } from "@/components/auth/auth-forms";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Set up your workspace" };

type Check = { label: string; ok: boolean; fix: string };

async function diagnose(): Promise<{ checks: Check[]; ready: boolean; hasOwner: boolean }> {
  const env = serverEnv();
  const checks: Check[] = [
    { label: "Supabase URL and public key", ok: isSupabaseConfigured, fix: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the project's environment variables." },
    { label: "Supabase service key", ok: Boolean(env.supabaseServiceKey), fix: "Add SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API keys)." },
  ];
  let hasOwner = false;
  let schemaOk = false;
  if (checks.every((c) => c.ok)) {
    const { count, error } = await createAdminClient().from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
    schemaOk = !error;
    hasOwner = (count ?? 0) > 0;
  }
  checks.push({ label: "Database schema installed", ok: schemaOk, fix: "Run the SQL files in supabase/migrations against your Supabase project (npm run db:push, or paste them into the SQL editor in order)." });
  return { checks, ready: checks.every((c) => c.ok), hasOwner };
}

export default async function SetupPage() {
  const { checks, ready, hasOwner } = await diagnose();
  if (ready && hasOwner) redirect("/login");

  if (!ready) {
    return (
      <>
        <Heading title="Almost there" subtitle="The dashboard can't reach its database yet. Fix the items below and reload this page." />
        <ul className="grid gap-2.5">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              {check.ok ? <CircleCheck className="mt-0.5 size-4.5 shrink-0 text-good-ink" aria-hidden /> : <CircleX className="mt-0.5 size-4.5 shrink-0 text-critical-ink" aria-hidden />}
              <div className="text-[13px]">
                <p className="font-semibold text-ink">{check.label} <span className="sr-only">{check.ok ? "— ready" : "— needs attention"}</span></p>
                {!check.ok && <p className="mt-0.5 leading-relaxed text-ink-3">{check.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <Heading title="Create the owner account" subtitle="You're the first one here. This account becomes the Super Admin — you'll invite everyone else from inside the dashboard." />
      <SetupForm needsSecret={Boolean(serverEnv().setupSecret)} />
    </>
  );
}
