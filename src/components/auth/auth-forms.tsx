"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Eye, EyeOff } from "lucide-react";
import { acceptInvite, createOwner, requestPasswordReset, resetPassword, signIn } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type { ActionResult } from "@/lib/actions";

function Notice({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok) {
    return state.message ? (
      <p role="status" className="flex items-start gap-2 rounded-xl bg-good-soft px-3.5 py-3 text-[13px] font-medium text-good-ink">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    ) : null;
  }
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-critical-soft px-3.5 py-3 text-[13px] font-medium text-critical-ink">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {state.error}
    </p>
  );
}

function PasswordInput({ id, name = "password", autoComplete, invalid }: { id: string; name?: string; autoComplete: string; invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required minLength={8} maxLength={72} aria-invalid={invalid} className="pr-10" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-7">
      <h2 className="text-2xl font-extrabold text-ink">{title}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{subtitle}</p>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Notice state={state} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="you@organisation.com" />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" autoComplete="current-password" />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">Sign in</Button>
      <Link href="/forgot-password" className="justify-self-center text-[13px] font-semibold text-accent-ink hover:underline">Forgot your password?</Link>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="grid gap-4">
      <Notice state={state} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="you@organisation.com" />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">Email me a reset link</Button>
      <Link href="/login" className="justify-self-center text-[13px] font-semibold text-accent-ink hover:underline">Back to sign in</Link>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Notice state={state} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">Save and sign in</Button>
    </form>
  );
}

export function AcceptInviteForm({ token, name, email }: { token: string; name: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInvite, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Notice state={state} />
      <Field label="Email" htmlFor="invite-email">
        <Input id="invite-email" value={email} readOnly disabled autoComplete="username" />
      </Field>
      <Field label="Your name" htmlFor="full_name" hint="As it should appear to the team.">
        <Input id="full_name" name="full_name" defaultValue={name} autoComplete="name" required maxLength={120} />
      </Field>
      <Field label="Choose a password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">Join the team</Button>
    </form>
  );
}

export function SetupForm({ needsSecret }: { needsSecret: boolean }) {
  const [state, action, pending] = useActionState(createOwner, null);
  return (
    <form action={action} className="grid gap-4">
      <Notice state={state} />
      <Field label="Your name" htmlFor="full_name">
        <Input id="full_name" name="full_name" autoComplete="name" required maxLength={120} placeholder="Prof. Douglas Boateng" />
      </Field>
      <Field label="Organisation" htmlFor="organization" optional>
        <Input id="organization" name="organization" autoComplete="organization" maxLength={120} placeholder="PanAvest" />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" autoComplete="new-password" />
      </Field>
      {needsSecret && (
        <Field label="Setup code" htmlFor="setup_secret" hint="The SETUP_SECRET value from your deployment.">
          <Input id="setup_secret" name="setup_secret" type="password" autoComplete="off" required />
        </Field>
      )}
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">Create owner account</Button>
    </form>
  );
}
