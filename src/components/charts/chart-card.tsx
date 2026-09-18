"use client";

import { useState } from "react";
import { ChartNoAxesColumn, Table2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

type ChartCardProps = {
  title: string;
  description?: string;
  /** Column headers and rows of the chart's data — the accessible twin of the picture. */
  table: { columns: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

/** Every chart ships with a table view: nothing is readable by hover or colour alone. */
export function ChartCard({ title, description, table, children, footer, className }: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        action={
          <Tooltip content={asTable ? "Show chart" : "Show as table"}>
            <Button variant="ghost" size="icon-sm" aria-pressed={asTable} aria-label={asTable ? "Show chart" : "Show as table"} onClick={() => setAsTable((v) => !v)}>
              {asTable ? <ChartNoAxesColumn /> : <Table2 />}
            </Button>
          </Tooltip>
        }
      />
      <CardBody>
        {asTable ? (
          <div className="scroll-slim max-h-72 overflow-auto rounded-xl border border-line">
            <table className="w-full text-left text-[12.5px]">
              <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wide text-ink-3">
                <tr>{table.columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-bold">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={j === 0 ? "px-3 py-2 font-semibold text-ink" : "tabular px-3 py-2 text-ink-2"}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
        {footer}
      </CardBody>
    </Card>
  );
}

type TipRow = { label: string; value: string | number; color?: string };

/** Shared tooltip body: value leads, label follows; series keyed by a short stroke. */
export function ChartTooltip({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-overlay">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">{title}</p>
      <ul className="grid gap-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs">
            {row.color && <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: row.color }} />}
            <strong className="tabular font-bold text-ink">{row.value}</strong>
            <span className="text-ink-2">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
