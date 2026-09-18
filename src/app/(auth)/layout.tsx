import Image from "next/image";
import { CalendarDays, MapPin } from "lucide-react";
import { DEFAULT_EVENT } from "@/lib/domain";
import { daysUntil, formatDate } from "@/lib/utils";

// First-run setup reads the database and the countdown reads the clock: never freeze these at build time.
export const dynamic = "force-dynamic";

/** Split-screen brand frame for every signed-out page. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  const event = DEFAULT_EVENT;
  const days = daysUntil(event.starts_at);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(90%_70%_at_100%_0%,#804a95_0%,transparent_60%),radial-gradient(70%_60%_at_0%_100%,#2f2f86_0%,transparent_65%)]" />
        <div aria-hidden className="pattern-navy absolute inset-y-0 right-0 w-14 opacity-[0.16] mix-blend-screen invert" />
        <div className="relative">
          <Image src="/brand/logo-white.png" alt="BGS — The Boardroom Governance Summit" width={720} height={207} priority className="h-auto w-[300px]" />
        </div>

        <div className="relative max-w-xl">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-gold">Summit command centre</p>
          <h1 className="text-[40px] font-extrabold leading-[1.1] xl:text-5xl">{event.theme}</h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/75">
            One place for every deliverable, panelist, sponsor, ticket and post — so the summit lands exactly as planned.
          </p>
          <div className="mt-8 h-1 w-40 rounded-full flag-stripe" />
        </div>

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <dl className="grid gap-2.5 text-sm text-white/85">
            <div className="flex items-center gap-2.5">
              <CalendarDays className="size-4 text-gold" aria-hidden />
              <dt className="sr-only">Date</dt>
              <dd className="font-semibold">{formatDate(event.starts_at, { weekday: true })}</dd>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin className="size-4 text-gold" aria-hidden />
              <dt className="sr-only">Venue</dt>
              <dd className="font-semibold">{event.venue}, {event.city}</dd>
            </div>
          </dl>
          {days !== null && days >= 0 && (
            <div className="rounded-2xl border border-white/15 bg-white/[0.07] px-5 py-3 text-right backdrop-blur">
              <p className="text-4xl font-extrabold leading-none text-gold">{days}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">{days === 1 ? "day to go" : "days to go"}</p>
            </div>
          )}
        </div>
      </aside>

      {/* Form column */}
      <main className="flex min-h-dvh flex-col bg-bg pt-safe pb-safe">
        <div className="flex items-center justify-between bg-navy px-5 py-4 lg:hidden">
          <Image src="/brand/logo-white.png" alt="BGS — The Boardroom Governance Summit" width={720} height={207} priority className="h-auto w-40" />
          {days !== null && days >= 0 && (
            <p className="text-right text-[11px] font-bold uppercase tracking-wider text-white/75">
              <span className="block text-xl leading-none text-gold">{days}</span>days to go
            </p>
          )}
        </div>
        <div className="h-1 flag-stripe lg:hidden" />
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px] animate-rise">{children}</div>
        </div>
        <p className="px-5 pb-5 text-center text-[11px] text-ink-3">
          A PanAvest International &amp; Partners initiative · {event.tagline}
        </p>
      </main>
    </div>
  );
}
