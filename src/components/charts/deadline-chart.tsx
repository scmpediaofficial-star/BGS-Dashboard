"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, ChartTooltip } from "@/components/charts/chart-card";
import { Legend } from "@/components/charts/segmented-bar";

export type DeadlineBucket = { key: string; label: string; done: number; open: number; isCurrent: boolean; isEvent: boolean };

const DONE = "var(--good)";
const OPEN = "var(--accent)";

/** Deliverables due per week: finished vs still open. Shows where the workload piles up before the summit. */
export function DeadlineChart({ buckets, className }: { buckets: DeadlineBucket[]; className?: string }) {
  const current = buckets.find((b) => b.isCurrent);
  const event = buckets.find((b) => b.isEvent);

  return (
    <ChartCard
      className={className}
      title="Deadline load"
      description="Deliverables due each week — finished vs still open"
      table={{ columns: ["Week of", "Completed", "Open"], rows: buckets.map((b) => [b.label, b.done, b.open]) }}
      footer={<Legend className="mt-3" items={[{ label: "Completed", color: DONE }, { label: "Open", color: OPEN }]} />}
    >
      {/* Height includes the x-axis band so the card never scrolls internally. */}
      <div className="h-60 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 30, right: 4, bottom: 0, left: -22 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} tickMargin={8} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              cursor={{ fill: "var(--surface-3)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const b = payload?.[0]?.payload as DeadlineBucket | undefined;
                if (!active || !b) return null;
                return <ChartTooltip title={`Week of ${b.label}`} rows={[{ label: "completed", value: b.done, color: DONE }, { label: "open", value: b.open, color: OPEN }]} />;
              }}
            />
            {current && <ReferenceLine x={current.label} stroke="var(--ink-3)" strokeWidth={1} label={{ value: "This week", position: "top", fill: "var(--ink-2)", fontSize: 10.5, fontWeight: 600 }} />}
            {event && event !== current && <ReferenceLine x={event.label} stroke="var(--gold-ink)" strokeWidth={1} label={{ value: "Summit", position: "top", dy: -12, fill: "var(--gold-ink)", fontSize: 10.5, fontWeight: 700 }} />}
            {/* 2px surface-coloured stroke = the gap between stacked segments */}
            <Bar dataKey="done" stackId="a" fill={DONE} maxBarSize={24} stroke="var(--surface)" strokeWidth={2} radius={[0, 0, 0, 0]} />
            <Bar dataKey="open" stackId="a" fill={OPEN} maxBarSize={24} stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
