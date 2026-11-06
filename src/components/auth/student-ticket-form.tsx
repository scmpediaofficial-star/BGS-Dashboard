"use client";

import { useEffect, useRef, useState } from "react";
import { FileImage, FileText, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { completeStudentDetails, lookupStudentTicket, recordStudentDownload, type StudentTicketView } from "@/app/(auth)/student-ticket/actions";
import { useAction } from "@/components/shared/use-action";
import { paintTicket, saveBlob, ticketFileName, ticketPng, ticketsPdf, TICKET_H, TICKET_W, type TicketFace } from "@/components/tickets/ticket-art";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";

const faceOf = (t: StudentTicketView): TicketFace => ({ code: t.code, kind: "student", name: t.name, organization: t.institutionName, roleLabel: null, logoUrl: t.logoUrl });

/** Signed-out page: a student enters the code they were given, adds any details the team doesn't have yet, then downloads their ticket. */
export function StudentTicketForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [ticket, setTicket] = useState<StudentTicketView | null>(null);
  const [lookup, looking] = useAction(lookupStudentTicket, { silent: true, onSuccess: setTicket });

  return (
    <div>
      <span className="mb-5 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-ink"><GraduationCap aria-hidden /></span>
      <h1 className="text-2xl font-extrabold text-ink">Student ticket</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        {ticket ? "Your complimentary ticket for the Boardroom Governance Summit." : "Enter the ticket code you were given to complete your details and download your complimentary ticket."}
      </p>

      {!ticket ? (
        <Card className="mt-6 p-5">
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); lookup({ code }); }}>
            <Field label="Ticket code" htmlFor="student-code" hint="It looks like BGS-K7QM-4XWP.">
              <Input id="student-code" required autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="BGS-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
            <Button type="submit" loading={looking}>Find my ticket</Button>
          </form>
        </Card>
      ) : (
        <TicketStep ticket={ticket} onTicket={setTicket} onReset={() => { setTicket(null); setCode(""); }} />
      )}
    </div>
  );
}

function TicketStep({ ticket, onTicket, onReset }: { ticket: StudentTicketView; onTicket: (t: StudentTicketView) => void; onReset: () => void }) {
  const [draft, setDraft] = useState({ programme: "", email: "", phone: "" });
  const [save, saving] = useAction(completeStudentDetails, { success: "Details saved", onSuccess: onTicket });

  return (
    <>
      <Card className="mt-6 p-5">
        <p className="text-base font-extrabold text-ink">{ticket.name}</p>
        <p className="mt-0.5 text-[13px] text-ink-2">Student of {ticket.institutionName}</p>
        {ticket.studentNumber && <p className="mt-0.5 text-xs text-ink-3">Student number {ticket.studentNumber}</p>}
        <p className="mt-3 font-mono text-[13px] font-bold text-ink-2">{ticket.code}</p>
        <button type="button" className="mt-3 text-xs font-semibold text-accent-ink hover:underline" onClick={onReset}>Not you? Use a different code</button>
      </Card>

      {ticket.complete ? (
        <Download ticket={ticket} />
      ) : (
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-bold text-ink">Before you download</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">We need a few details so the organisers know who is attending.</p>
          <form className="mt-4 grid gap-4" onSubmit={(event) => { event.preventDefault(); save({ code: ticket.code, ...draft }); }}>
            {ticket.programme ? <Known label="Programme" value={ticket.programme} /> : (
              <Field label="Programme of study" htmlFor="student-programme"><Input id="student-programme" required autoComplete="off" placeholder="e.g. MBA Finance" value={draft.programme} onChange={(e) => setDraft({ ...draft, programme: e.target.value })} /></Field>
            )}
            {ticket.email ? <Known label="Email" value={ticket.email} /> : (
              <Field label="Email address" htmlFor="student-email"><Input id="student-email" type="email" required autoComplete="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            )}
            {ticket.phone ? <Known label="Phone" value={ticket.phone} /> : (
              <Field label="Phone number" htmlFor="student-phone"><Input id="student-phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="024 123 4567" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            )}
            <Button type="submit" loading={saving}>Save and show my ticket</Button>
          </form>
        </Card>
      )}
    </>
  );
}

function Known({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold text-ink-3">{label}</p><p className="mt-0.5 text-sm text-ink">{value}</p></div>;
}

function Download({ ticket }: { ticket: StudentTicketView }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
  const face = faceOf(ticket);
  const { code, name, institutionName, logoUrl } = ticket;
  const { dateLine, venueLine, admitLabel } = ticket.event;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    paintTicket(canvas, { code, kind: "student", name, organization: institutionName, roleLabel: null, logoUrl }, { dateLine, venueLine, admitLabel }).then(
      () => { if (!cancelled) setFailed(false); },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, [code, name, institutionName, logoUrl, dateLine, venueLine, admitLabel]);

  async function download(format: "png" | "pdf") {
    setBusy(format);
    try {
      saveBlob(format === "png" ? await ticketPng(face, ticket.event) : await ticketsPdf([face], ticket.event), `${ticketFileName(face)}.${format}`);
      void recordStudentDownload({ code });
    } catch (error) {
      console.error("[student-ticket]", error);
      toast.error("The ticket could not be created. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-4 p-4">
      <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
        <canvas ref={ref} width={TICKET_W} height={TICKET_H} role="img" aria-label={`Complimentary student ticket for ${name}`} className="block h-auto w-full" />
      </div>
      {failed && <p className="mt-2 text-xs text-critical-ink">The ticket could not be drawn. Check your connection and refresh the page.</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => download("png")} loading={busy === "png"} disabled={failed || busy === "pdf"}>{busy !== "png" && <FileImage />} Image (PNG)</Button>
        <Button variant="outline" onClick={() => download("pdf")} loading={busy === "pdf"} disabled={failed || busy === "png"}>{busy !== "pdf" && <FileText />} PDF</Button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">Bring your ticket (on your phone or printed) to the summit. Your ticket number is {code}.</p>
    </Card>
  );
}
