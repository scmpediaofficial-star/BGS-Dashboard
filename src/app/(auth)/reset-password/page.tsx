import type { Metadata } from "next";
import Link from "next/link";
import { Heading, ResetForm } from "@/components/auth/auth-forms";
import { Button } from "@/components/ui/button";
import { verifyToken } from "@/lib/crypto";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  if (!verifyToken("reset", token)) {
    return (
      <>
        <Heading title="This link has expired" subtitle="Reset links work once and last for an hour. Request a fresh one and try again." />
        <Button asChild size="lg" className="w-full"><Link href="/forgot-password">Request a new link</Link></Button>
      </>
    );
  }

  return (
    <>
      <Heading title="Choose a new password" subtitle="You'll be signed in as soon as it's saved." />
      <ResetForm token={token} />
    </>
  );
}
