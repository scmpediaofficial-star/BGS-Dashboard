import Link from "next/link";
import { ArrowRight, CircleCheck, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export type SetupStep = { label: string; description: string; href: string; done: boolean };

/** Shown to administrators until the workspace is fully switched on. */
export function GettingStarted({ steps, welcome }: { steps: SetupStep[]; welcome: boolean }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="lg:w-64 lg:shrink-0">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-ink">
            <Sparkles className="size-3.5" aria-hidden /> {welcome ? "Welcome aboard" : "Finish setting up"}
          </p>
          <h2 className="mt-1 text-base font-bold text-ink">{welcome ? "Your workspace is live" : "A few switches left"}</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">The summit&apos;s trackers are already loaded. These steps turn on people, alerts and publishing.</p>
          <div className="mt-3 flex items-center gap-2.5">
            <Meter value={done} max={steps.length} label="Setup progress" size="sm" tone="good" />
            <span className="tabular shrink-0 text-xs font-bold text-ink">{done}/{steps.length}</span>
          </div>
        </div>
        <ol className="grid flex-1 gap-2 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.label}>
              <Link
                href={step.href}
                className={cn(
                  "group flex h-full items-start gap-3 rounded-xl border p-3 transition-colors",
                  step.done ? "border-line bg-surface-2" : "border-line-strong hover:border-accent hover:bg-accent-soft/40",
                )}
              >
                <CircleCheck className={cn("mt-0.5 size-4.5 shrink-0", step.done ? "text-good-ink" : "text-line-strong")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13px] font-semibold", step.done ? "text-ink-3 line-through decoration-ink-3/40" : "text-ink")}>
                    {step.label}<span className="sr-only">{step.done ? " — done" : " — to do"}</span>
                  </span>
                  {!step.done && <span className="mt-0.5 block text-xs leading-snug text-ink-3">{step.description}</span>}
                </span>
                {!step.done && <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-ink" aria-hidden />}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
