"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Award, Building2, ChevronDown, Download, Eye, FileArchive, FileImage, FileText, Search, Tag } from "lucide-react";
import { toast } from "sonner";
import { setTicketInstitution } from "@/app/(app)/tickets/actions";
import { CERT_H, CERT_W, certificateFileName, certificatePng, certificatesPdf, certificatesPngZip, paintCertificate, type CertificateEvent, type CertificateFace } from "@/components/certificates/certificate-art";
import { certificateRows, toCertificateFace, type CertInstitution, type CertSale, type CertTicket, type CertificateRow, type LabelSource } from "@/components/certificates/types";
import { StatTile } from "@/components/charts/stat-tile";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { saveBlob } from "@/components/tickets/ticket-art";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Input, Select, Switch } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { formatNumber, pluralize } from "@/lib/utils";

const PAGE = 100;
const SOURCE_LABEL: Record<LabelSource, string> = { ticket: "Set by hand", payment: "Paid for by the institution", organisation: "Matched from organisation" };

type Props = { tickets: CertTicket[]; sales: CertSale[]; institutions: CertInstitution[]; event: CertificateEvent };

/** A certificate for everyone who has paid, with their institution's logo where they belong to one. */
export function CertificatesPanel({ tickets, sales, institutions, event }: Props) {
  const { can } = useViewer();
  const manage = can("tickets.manage");
  useRealtimeRefresh(["tickets", "ticket_sales", "institutions"]);
  const rows = useMemo(() => certificateRows(tickets, sales, institutions), [tickets, sales, institutions]);
  const unnamed = useMemo(() => tickets.filter((t) => t.kind === "paid" && t.status !== "void" && !(t.holder_name ?? "").trim()).length, [tickets]);

  const [query, setQuery] = useState("");
  const [institution, setInstitution] = useState("all");
  const [checkedInOnly, setCheckedInOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [progress, setProgress] = useState<string | null>(null);
  const [preview, setPreview] = useState<CertificateRow | null>(null);
  const [tieTo, setTieTo] = useState("");

  const [tie, tying] = useAction(setTicketInstitution, { success: ({ count }) => `${pluralize(count, "certificate")} updated` });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) =>
      (!checkedInOnly || r.checkedIn) &&
      (institution === "all" || (institution === "none" ? !r.institution : r.institution?.id === institution)) &&
      (!needle || `${r.name} ${r.code} ${r.organization ?? ""} ${r.institution?.name ?? ""}`.toLowerCase().includes(needle)));
  }, [rows, query, institution, checkedInOnly]);
  const visible = filtered.slice(0, shown);
  const labelled = rows.filter((r) => r.institution).length;

  const bulkName = `BGS-2026-certificates-${filtered.length}`;
  async function bulk(format: "pdf" | "png") {
    if (!filtered.length || progress) return;
    const faces = filtered.map(toCertificateFace);
    const label = (done: number) => `Preparing ${formatNumber(done)} of ${formatNumber(faces.length)}…`;
    setProgress(label(0));
    try {
      const report = (done: number) => setProgress(label(done));
      const blob = format === "pdf" ? await certificatesPdf(faces, event, report) : await certificatesPngZip(faces, event, (face: CertificateFace) => `${certificateFileName(face)}.png`, report);
      saveBlob(blob, `${bulkName}.${format === "pdf" ? "pdf" : "zip"}`);
      toast.success(`${pluralize(faces.length, "certificate")} saved`);
    } catch (error) {
      console.error("[certificates]", error);
      toast.error("The certificates could not be created. Check your connection and try again.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <section aria-label="Certificates at a glance" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Certificates" value={formatNumber(rows.length)} icon={Award} caption="One for each named paid ticket" />
        <StatTile label="With an institution" value={formatNumber(labelled)} icon={Building2} caption="Logo printed top right" />
        <StatTile label="Checked in" value={formatNumber(rows.filter((r) => r.checkedIn).length)} icon={Tag} caption="Already at the door" />
        <StatTile label="No name yet" value={formatNumber(unnamed)} icon={Tag} tone={unnamed ? "critical" : "good"} caption={unnamed ? "Paid tickets that cannot get a certificate" : "Every paid ticket is named"} />
      </section>

      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search certificates" placeholder="Search by name, ticket no. or organisation…" className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-56">
            <Select aria-label="Filter by institution" value={institution} onChange={(e) => { setInstitution(e.target.value); setShown(PAGE); }}>
              <option value="all">All institutions</option>
              <option value="none">No institution</option>
              {institutions.map((i) => <option key={i.id} value={i.id}>{i.short_name ?? i.name}</option>)}
            </Select>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[12.5px] font-semibold text-ink-2">
            <Switch checked={checkedInOnly} onCheckedChange={(v) => { setCheckedInOnly(v); setShown(PAGE); }} aria-label="Checked in only" /> Checked in only
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button loading={!!progress} disabled={!filtered.length}>{!progress && <Download />} {progress ?? "Download"} {!progress && <ChevronDown aria-hidden className="opacity-70" />}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{pluralize(filtered.length, "certificate")} shown</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => bulk("pdf")}><FileText aria-hidden /> One PDF, a certificate per page</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => bulk("png")}><FileArchive aria-hidden /> PNG images in a .zip</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {manage && institutions.length > 0 && filtered.length > 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-0 flex-1 text-[13px] text-ink-2">Put an institution&apos;s logo on <strong className="font-bold text-ink">all {pluralize(filtered.length, "certificate")} shown</strong>. Members an institution paid for, and people who wrote the institution as their organisation, are matched on their own.</p>
          <Select aria-label="Institution for the certificates shown" className="w-56" value={tieTo} onChange={(e) => setTieTo(e.target.value)}>
            <option value="">Choose an institution…</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.short_name ?? i.name}</option>)}
          </Select>
          <Button variant="outline" loading={tying} disabled={!tieTo} onClick={() => tie({ ticket_ids: filtered.map((r) => r.id), institution_id: tieTo })}><Tag /> Apply</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Award} title={rows.length ? "No certificate matches" : "No certificates yet"}
            description={rows.length ? "Try another search or institution." : "A certificate appears here for each paid ticket as soon as it has a name on it."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                  <tr><th className="px-5 py-3">Name on the certificate</th><th className="px-3 py-3">Institution label</th><th className="px-3 py-3">Ticket no.</th><th className="px-5 py-3 text-right">Certificate</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <td className="max-w-[20rem] px-5 py-3"><p className="truncate text-[13px] font-semibold text-ink">{r.name}</p>{r.organization && <p className="truncate text-ink-3">{r.organization}</p>}</td>
                      <td className="px-3 py-2.5"><LabelCell row={r} institutions={institutions} manage={manage} onChange={(id) => tie({ ticket_ids: [r.id], institution_id: id })} /></td>
                      <td className="px-3 py-3 font-mono font-semibold text-ink-2">{r.code}</td>
                      <td className="px-5 py-2 text-right"><RowActions row={r} event={event} onPreview={() => setPreview(r)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {visible.map((r) => (
                <li key={r.id} className="grid gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-[13px] font-bold text-ink">{r.name}</p><p className="mt-0.5 font-mono text-xs font-semibold text-ink-2">{r.code}</p></div>
                    <RowActions row={r} event={event} onPreview={() => setPreview(r)} />
                  </div>
                  <LabelCell row={r} institutions={institutions} manage={manage} onChange={(id) => tie({ ticket_ids: [r.id], institution_id: id })} />
                </li>
              ))}
            </ul>
            {filtered.length > visible.length && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-ink-3">
                <span>Showing {formatNumber(visible.length)} of {formatNumber(filtered.length)}. Downloads include all {formatNumber(filtered.length)}.</span>
                <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>
              </div>
            )}
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-ink-3">
        Institutions, their logos and their members are managed under <Link href="/institutions" className="font-semibold text-accent-ink hover:underline">Institutions</Link>. A certificate takes the convener, date and venue from Settings.
      </p>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        {preview && (
          <DialogContent size="xl" title={preview.name} description={`Certificate ${preview.code}${preview.institution ? ` · ${preview.institution.name}` : ""}`}
            footer={<><Button variant="outline" onClick={() => setPreview(null)}>Close</Button><DownloadMenu row={preview} event={event} variant="button" /></>}>
            <CertificatePreview face={toCertificateFace(preview)} event={event} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function LabelCell({ row, institutions, manage, onChange }: { row: CertificateRow; institutions: CertInstitution[]; manage: boolean; onChange: (institutionId: string | null) => void }) {
  const current = row.source === "ticket" ? row.institution?.id ?? "" : "";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {row.institution ? (
        <>
          {row.institution.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage or bundled brand logo, host varies
            <img src={row.institution.logo_url} alt="" className="size-9 shrink-0 rounded-md border border-line bg-white object-contain p-0.5" />
          ) : <span className="grid size-9 shrink-0 place-items-center rounded-md border border-dashed border-line-strong text-ink-3"><Building2 className="size-4" aria-hidden /></span>}
          <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold text-ink">{row.institution.short_name ?? row.institution.name}</p><p className="truncate text-[11px] text-ink-3">{row.source ? SOURCE_LABEL[row.source] : ""}{row.institution.logo_url ? "" : " · no logo yet"}</p></div>
        </>
      ) : <Badge tone="neutral" size="sm">No label</Badge>}
      {manage && institutions.length > 0 && (
        <Select aria-label={`Institution label for ${row.name}`} className="h-8 w-40 text-xs" value={current} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{row.source && row.source !== "ticket" ? "Automatic" : "None"}</option>
          {institutions.map((i) => <option key={i.id} value={i.id}>{i.short_name ?? i.name}</option>)}
        </Select>
      )}
    </div>
  );
}

function RowActions({ row, event, onPreview }: { row: CertificateRow; event: CertificateEvent; onPreview: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="ghost" size="icon-sm" aria-label={`Preview the certificate for ${row.name}`} onClick={onPreview}><Eye /></Button>
      <DownloadMenu row={row} event={event} />
    </div>
  );
}

function DownloadMenu({ row, event, variant = "label" }: { row: CertificateRow; event: CertificateEvent; variant?: "label" | "button" }) {
  const [busy, setBusy] = useState(false);
  async function download(format: "png" | "pdf") {
    setBusy(true);
    try {
      const face = toCertificateFace(row);
      saveBlob(format === "png" ? await certificatePng(face, event) : await certificatesPdf([face], event), `${certificateFileName(face)}.${format}`);
    } catch (error) {
      console.error("[certificate]", error);
      toast.error("The certificate could not be created. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={variant === "button" ? "md" : "sm"} loading={busy} aria-label={`Download the certificate for ${row.name}`}>{!busy && <Download />} Download</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => download("pdf")}><FileText aria-hidden /> PDF</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download("png")}><FileImage aria-hidden /> PNG image</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The certificate exactly as it will download. */
function CertificatePreview({ face, event }: { face: CertificateFace; event: CertificateEvent }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const { code, name } = face;
  const instName = face.institution?.name ?? null;
  const instLogo = face.institution?.logoUrl ?? null;
  const { title, dateLine, venueLine, theme, convener } = event;

  useEffect(() => {
    let cancelled = false;
    const canvas = ref.current;
    if (!canvas) return;
    paintCertificate(canvas, { code, name, institution: instName ? { name: instName, logoUrl: instLogo } : null }, { title, dateLine, venueLine, theme, convener }).then(
      () => { if (!cancelled) setFailed(false); },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, [code, name, instName, instLogo, title, dateLine, venueLine, theme, convener]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
      <canvas ref={ref} width={CERT_W} height={CERT_H} role="img" aria-label={`Certificate for ${name}`} className="block h-auto w-full" />
      {failed && <p className="px-3 py-2 text-xs text-critical-ink">The preview could not be drawn. Check your connection.</p>}
    </div>
  );
}
