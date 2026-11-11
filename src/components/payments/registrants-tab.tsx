"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Users, Video, Ticket } from "lucide-react";
import { toast } from "sonner";
import { groupSummary, money, type RegistrantGroup, type RegistrantsReport } from "@/components/payments/registrants";
import { registrantsPdf, registrantsXlsx } from "@/components/payments/registrants-export";
import { saveBlob } from "@/components/tickets/ticket-art";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { isoDay } from "@/lib/utils";

const ICON = { "zoom-student": Video, "zoom-regular": Video, "in-person": Ticket, other: Users } as const;

/** Everyone who paid on Paystack in three labelled lists, ready to download as PDF or Excel. */
export function RegistrantsTab({ report }: { report: RegistrantsReport | undefined }) {
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  if (!report) return <Card><EmptyState icon={Users} title="Registrants could not be loaded" description="Paystack did not answer. Refresh in a moment." /></Card>;

  const download = async (kind: "pdf" | "xlsx") => {
    setBusy(kind);
    try {
      // Let the button show it is working before the file is put together.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const blob = kind === "pdf" ? registrantsPdf(report) : registrantsXlsx(report);
      saveBlob(blob, `BGS-2026-registrants-${isoDay()}.${kind}`);
    } catch (error) {
      console.error(error);
      toast.error(`The ${kind === "pdf" ? "PDF" : "Excel file"} could not be made. Please try again.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Everyone who has paid on Paystack, list by list</p>
          <p className="mt-0.5 text-xs text-ink-3">As at {report.generatedAt}. The files hold names, emails and phone numbers: share them only with the summit team.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={busy === "pdf"} onClick={() => download("pdf")}>{busy !== "pdf" && <FileText />} Download PDF</Button>
          <Button variant="outline" loading={busy === "xlsx"} onClick={() => download("xlsx")}>{busy !== "xlsx" && <FileSpreadsheet />} Download Excel</Button>
        </div>
      </Card>
      {report.truncated && <p className="rounded-xl border border-line bg-warning-soft px-4 py-2.5 text-xs font-medium text-warning-ink">Paystack holds more payments than were read; only the most recent 1,000 are listed.</p>}
      {report.groups.map((group) => <GroupCard key={group.key} group={group} />)}
    </div>
  );
}

function GroupCard({ group }: { group: RegistrantGroup }) {
  const Icon = ICON[group.key];
  const columns = group.columns.filter((c) => !c.excelOnly);
  const show = (key: string, value: string | number | undefined) => (typeof value === "number" ? (key === "amount" ? money(value, group.currency) : String(value)) : value || "—");
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-4 sm:px-5">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-ink"><Icon aria-hidden className="size-4 text-accent-ink" /> {group.title}</h2>
        <p className="mt-1 text-xs font-semibold text-ink-2">{groupSummary(group)}</p>
        <p className="mt-1 max-w-3xl text-xs text-ink-3">{group.note}</p>
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
                  <tr key={String(row.reference)} className="hover:bg-surface-2">
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
              <li key={String(row.reference)} className="p-4">
                <p className="text-[13px] font-bold text-ink">{row.no}. {row.name}</p>
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
