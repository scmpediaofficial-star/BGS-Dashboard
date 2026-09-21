"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/charts/chart-card";
import { formatNumber } from "@/lib/utils";

export type SalesPoint = { day: string; label: string; sold: number; total: number };

/** Cumulative tickets sold. One series, so no legend — the card title names it. */
export function SalesChart({ points, target }: { points: SalesPoint[]; target: number | null }) {
  const max = Math.max(target ?? 0, points.at(-1)?.total ?? 0);
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity={0.16} />
              <stop offset="1" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={52} domain={[0, Math.max(4, Math.ceil(max * 1.1))]} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip
            cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as SalesPoint | undefined;
              if (!active || !p) return null;
              return <ChartTooltip title={p.label} rows={[{ label: "sold to date", value: formatNumber(p.total), color: "var(--accent)" }, { label: "sold that day", value: formatNumber(p.sold) }]} />;
            }}
          />
          {target ? <ReferenceLine y={target} stroke="var(--gold-ink)" strokeWidth={1} label={{ value: `Target ${formatNumber(target)}`, position: "insideTopRight", fill: "var(--gold-ink)", fontSize: 10.5, fontWeight: 700 }} /> : null}
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="url(#salesFill)"
            dot={false}
            activeDot={{ r: 4.5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
