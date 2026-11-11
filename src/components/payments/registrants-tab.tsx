"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, ShieldCheck, Ticket, TicketX, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { groupSummary, money, type RegistrantGroup, type RegistrantsReport } from "@/components/payments/registrants";
import { registrantsPdf, registrantsXlsx } from "@/components/payments/registrants-export";
import { saveBlob } from "@/components/tickets/ticket-art";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { formatNumber, isoDay } from "@/lib/utils";

const ICON = { "in-person": Ticket, "in-person-unnamed": TicketX, "zoom-student": Video, "zoom-regular": Video, other: Users } as const;
const DOOR: RegistrantGroup["key"][] = ["in-person", "in-person-unnamed"];
type Kind = "pdf" | "xlsx";

/** Everyone who paid on Paystack in three labelled lists, ready to download as PDF or Excel. */
export function RegistrantsTab({ report }: { report: RegistrantsReport | undefined }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!report) return <Card><EmptyState icon={Users} title="Registrants could not be loaded" description="Paystack or the ticket ledger did not answer. Refresh in a moment." /></Card>;

  /** `label` names the button that is working and the file; `only` limits the lists. */
  const download = async (kind: Kind, label: string, only?: RegistrantGroup["key"][]) => {
    setBusy(`${label}.${kind}`);
    try {
      // Let the button show it is working before the file is put together.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const blob = kind === "pdf" ? registrantsPdf(report, only) : registrantsXlsx(report, only);
      saveBlob(blob, `BGS-2026-${label}-${isoDay()}.${kind}`);
    } catch (error) {
      console.error(error);
      toast.error(`The ${kind === "pdf" ? "PDF" : "Excel file"} could not be made. Please try again.`);
    } finally {
      setBusy(null);
    }
  };
  const door = report.groups.filter((g) => DOOR.includes(g.key));
  const doorCount = door.reduce((n, g) => n + g.count, 0);

  return (
    <div className="grid gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck aria-hidden className="size-4 text-accent-ink" /> Door list for security</p>
          <p className="mt-0.5 text-xs text-ink-3">Every valid in-person ticket ({formatNumber(doorCount)}), names A–Z with ticket codes and a box to tick. As at {report.generatedAt}. It holds personal data: share it only with the summit and security teams.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === "door-list.pdf"} onClick={() => download("pdf", "door-list", DOOR)}>{busy !== "door-list.pdf" && <FileText />} Door list (PDF)</Button>
          <Button variant="outline" loading={busy === "door-list.xlsx"} onClick={() => download("xlsx", "door-list", DOOR)}>{busy !== "door-list.xlsx" && <FileSpreadsheet />} Excel</Button>
        </div>
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Everyone, every list</p>
          <p className="mt-0.5 text-xs text-ink-3">In person and Zoom together, each list on its own pages (PDF) or sheet (Excel).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={busy === "registrants.pdf"} onClick={() => download("pdf", "registrants")}>{busy !== "registrants.pdf" && <FileText />} Download PDF</Button>
          <Button variant="outline" loading={busy === "registrants.xlsx"} onClick={() => download("xlsx", "registrants")}>{busy !== "registrants.xlsx" && <FileSpreadsheet />} Download Excel</Button>
        </div>
      </Card>
      {report.truncated && <p className="rounded-xl border border-line bg-warning-soft px-4 py-2.5 text-xs font-medium text-warning-ink">Paystack holds more payments than were read; only the most recent 1,000 are listed.</p>}
      {report.groups.map((group) => <GroupCard key={group.key} group={group} busy={busy} onDownload={(kind) => download(kind, group.key, [group.key])} />)}
    </div>
  );
}

function GroupCard({ group, busy, onDownload }: { group: RegistrantGroup; busy: string | null; onDownload: (kind: Kind) => void }) {
  const Icon = ICON[group.key];
  const columns = group.columns.filter((c) => !c.excelOnly && !c.printOnly);
  const show = (key: string, value: string | number | undefined) => (typeof value === "number" ? (key === "amount" ? money(value, group.currency) : String(value)) : value || "—");
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-ink"><Icon aria-hidden className="size-4 text-accent-ink" /> {group.title}</h2>
          <p className="mt-1 text-xs font-semibold text-ink-2">{groupSummary(group)}</p>
          <p className="mt-1 max-w-3xl text-xs text-ink-3">{group.note}</p>
        </div>
        {group.rows.length > 0 && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" loading={busy === `${group.key}.pdf`} onClick={() => onDownload("pdf")} aria-label={`Download ${group.title} as PDF`}>{busy !== `${group.key}.pdf` && <FileText />} PDF</Button>
            <Button variant="outline" size="sm" loading={busy === `${group.key}.xlsx`} onClick={() => onDownload("xlsx")} aria-label={`Download ${group.title} as Excel`}>{busy !== `${group.key}.xlsx` && <FileSpreadsheet />} Excel</Button>
          </div>
        )}
      </div>
      {!group.rows.length ? <p className="p-4 text-xs text-ink-3 sm:px-5">No registrations yet.</p> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{group.title}</caption>
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                <tr>{columns.map((c, i) => <th key={c.key} scope="col" className={`py-2.5 ${i === 0 ? "pl-5 pr-3" : i === columns.length - 1 ? "pl-3 pr-5" : "px-3"} ${c.numeric ? "text-right" : ""}`}>{c.header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {group.rows.map((row) => (
                  <tr key={String(row.code ?? row.reference ?? row.no)} className="hover:bg-surface-2">
                    {columns.map((c, i) => (
                      <td key={c.key} className={`py-2.5 ${i === 0 ? "pl-5 pr-3" : i === columns.length - 1 ? "pl-3 pr-5 font-mono text-[11px]" : "px-3"} ${c.numeric ? "text-right tabular-nums" : ""} ${c.key === "name" ? "font-semibold text-ink" : "text-ink-2"}`}>
                        {show(c.key, row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {group.rows.map((row) => (
              <li key={String(row.code ?? row.reference ?? row.no)} className="p-4">
                <p className="text-[13px] font-bold text-ink">{row.no}. {row.name || row.code}</p>
                {columns.filter((c) => !["no", "name"].includes(c.key)).map((c) => (
                  <p key={c.key} className="mt-0.5 truncate text-xs text-ink-3"><span className="text-ink-2">{c.header}:</span> {show(c.key, row[c.key])}</p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
