"use client";

import { useState } from "react";
import { Video } from "lucide-react";
import { checkVirtualAccess } from "@/app/(auth)/virtual-access/actions";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";

export function VirtualAccessForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [access, setAccess] = useState<{ joinUrl: string; meetingId: string | null } | null>(null);
  const [verify, checking] = useAction(checkVirtualAccess, { onSuccess: setAccess });
  return <div><span className="mb-5 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Video aria-hidden /></span>
    <h1 className="text-2xl font-extrabold text-ink">Virtual access</h1><p className="mt-2 text-sm leading-relaxed text-ink-2">Enter the email and personal code from your BGS access email to open the summit join link.</p>
    <Card className="mt-6 p-5"><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); setAccess(null); verify({ email, code }); }}><Field label="Ticket email" htmlFor="access-email"><Input id="access-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Field label="Personal access code" htmlFor="access-code"><Input id="access-code" required autoCapitalize="characters" placeholder="ABCD-EFGH" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field><Button type="submit" loading={checking}>Verify access</Button></form></Card>
    {access && <Card className="mt-4 border-good p-5"><h2 className="text-sm font-bold text-good-ink">Access confirmed</h2>{access.meetingId && <p className="mt-2 text-xs text-ink-2">Meeting ID: {access.meetingId}</p>}<Button asChild className="mt-4"><a href={access.joinUrl} target="_blank" rel="noopener noreferrer"><Video /> Open Zoom</a></Button></Card>}
  </div>;
}
