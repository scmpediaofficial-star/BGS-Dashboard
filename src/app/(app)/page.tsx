import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, CalendarClock, CalendarDays, CircleCheck, ClipboardCheck, Flag, Handshake, ListChecks, Mails, MapPin, MicVocal, PenSquare, Rocket, Ticket, Video,
} from "lucide-react";
import { DeadlineChart, type DeadlineBucket } from "@/components/charts/deadline-chart";
import { Legend, SegmentedBar } from "@/components/charts/segmented-bar";
import { StatTile } from "@/components/charts/stat-tile";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { GettingStarted, type SetupStep } from "@/components/overview/getting-started";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Meter } from "@/components/ui/misc";
import { can, hasRole } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { ACTION_STATUS, DELIVERABLE_PROGRESS_ORDER, DELIVERABLE_STATUS, OUTREACH_STATUS, PANELIST_STATUS } from "@/lib/domain";
import { isEmailConfigured } from "@/lib/email/send";
import { getSettings } from "@/lib/settings";
import { EVENT_TZ, cn, daysUntil, formatDate, formatDateTime, formatMoney, formatNumber, isoDay, percent, relativeDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const WEEK = 7 * 86_400_000;
/** Monday (UTC noon) of the week containing a YYYY-MM-DD day. */
function weekStart(day: string): number {
  const t = Date.parse(`${day}T12:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return t - dow * 86_400_000;
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: EVENT_TZ, hour: "numeric", hour12: false }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const { profile, role, supabase } = await requireSession();
  const params = await searchParams;
  const today = isoDay();

  const [settings, workstreams, deliverables, panels, panelists, outreach, sponsors, sales, actions, meetings, activity, posts, accounts, team] = await Promise.all([
    getSettings(),
    supabase.from("workstreams").select("id, slug, name").order("sort_order"),
    supabase.from("deliverables").select("id, title, status, due_date, workstream_id, responsibility, section, priority"),
    supabase.from("panels").select("id, number, title").order("number"),
    supabase.from("panelists").select("id, panel_id, status"),
    supabase.from("outreach_contacts").select("id, list, category, status"),
    supabase.from("sponsors").select("id, organization, stage, amount, currency"),
    supabase.from("ticket_sales").select("quantity, amount, payment_status, currency"),
    supabase.from("action_items").select("id, title, owner_label, due_date, due_label, status, assignee:profiles!action_items_assignee_id_fkey(full_name, avatar_url)").neq("status", "done").order("due_date", { nullsFirst: false }).limit(6),
    supabase.from("meetings").select("id, title, meeting_at, venue, mode").gte("meeting_at", new Date().toISOString()).neq("status", "cancelled").order("meeting_at").limit(1),
    supabase.from("activity_log").select("id, actor_name, summary, link, category, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("social_posts").select("id, content, scheduled_at, status").in("status", ["scheduled", "pending_approval"]).order("scheduled_at", { nullsFirst: false }).limit(4),
    supabase.from("social_accounts").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const { event, targets } = settings;
  const daysToGo = daysUntil(event.starts_at);
  const items = deliverables.data ?? [];
  const done = items.filter((d) => d.status === "completed").length;
  const open = items.filter((d) => d.status !== "completed");
  const overdue = open.filter((d) => d.due_date && d.due_date < today).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const dueSoon = open.filter((d) => d.due_date && d.due_date >= today && daysUntil(d.due_date)! <= 7).sort((a, b) => a.due_date!.localeCompare(b.due_date!));

  const people = panelists.data ?? [];
  const confirmedPanelists = people.filter((p) => p.status === "confirmed").length;
  const contacts = outreach.data ?? [];
  const reached = contacts.filter((c) => c.status !== "pending").length;
  const pipeline = sponsors.data ?? [];
  const confirmedSponsors = pipeline.filter((s) => s.stage === "confirmed");
  const paid = (sales.data ?? []).filter((s) => s.payment_status === "paid" || s.payment_status === "complimentary");
  const ticketsSold = paid.reduce((sum, s) => sum + s.quantity, 0);
  const revenue = paid.reduce((sum, s) => sum + Number(s.amount), 0);

  // Deadline load: everything older than four weeks collapses into one "Earlier" column.
  const thisWeek = weekStart(today);
  const eventWeek = weekStart(isoDay(event.starts_at));
  const floor = thisWeek - 4 * WEEK;
  const bucketMap = new Map<number, DeadlineBucket>();
  const lastDue = items.reduce((max, d) => (d.due_date ? Math.max(max, weekStart(d.due_date)) : max), eventWeek);
  bucketMap.set(floor - WEEK, { key: "earlier", label: "Earlier", done: 0, open: 0, isCurrent: false, isEvent: false });
  for (let t = floor; t <= lastDue; t += WEEK) {
    bucketMap.set(t, { key: String(t), label: formatDate(new Date(t), { year: false }), done: 0, open: 0, isCurrent: t === thisWeek, isEvent: t === eventWeek });
  }
  for (const d of items) {
    if (!d.due_date) continue;
    const bucket = bucketMap.get(Math.max(weekStart(d.due_date), floor - WEEK))!;
    if (d.status === "completed") bucket.done += 1; else bucket.open += 1;
  }
  const buckets = [...bucketMap.values()];

  // Open work by responsible party — nominal categories, so one colour for every bar.
  const byOwner = Object.entries(open.reduce<Record<string, number>>((acc, d) => {
    const key = d.responsibility?.trim() || "Unassigned";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const ownerMax = Math.max(1, ...byOwner.map(([, n]) => n));

  const setupSteps: SetupStep[] = [
    { label: "Invite your team", description: "Add colleagues and give each a role.", href: "/team?invite=1", done: (team.count ?? 0) > 1 },
    { label: "Connect Resend for email alerts", description: "Add RESEND_API_KEY so branded alerts reach inboxes.", href: "/settings/email", done: isEmailConfigured() },
    { label: "Switch on the scheduler", description: "One click: powers scheduled posts and the 6 am briefing.", href: "/settings", done: settings.scheduler.enabled },
    { label: "Connect a social channel", description: "LinkedIn, Facebook, Instagram, X, TikTok, WordPress and more.", href: "/social/accounts", done: (accounts.count ?? 0) > 0 },
  ];

  const firstName = (profile.full_name || "").replace(/^(prof|professor|dr|mr|mrs|ms|madam|ing|chief)\.?\s+/i, "").split(" ")[0] || "there";
  const nextMeeting = meetings.data?.[0];

  return (
    <div className="grid gap-5 lg:gap-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[20px] bg-navy text-white shadow-raised">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(80%_120%_at_100%_0%,#804a95_0%,transparent_58%),radial-gradient(60%_90%_at_0%_100%,#2f2f86_0%,transparent_60%)]" />
        <div aria-hidden className="pattern-navy absolute inset-y-0 right-0 hidden w-12 opacity-[0.14] mix-blend-screen invert sm:block" />
        <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="min-w-0 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{greeting()}, {firstName}</p>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-[32px]">{event.name}</h1>
            <p className="mt-1.5 text-[15px] font-medium text-white/80">{event.theme}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-white/85">
              <span className="flex items-center gap-2"><CalendarDays className="size-4 text-gold" aria-hidden />{formatDate(event.starts_at, { weekday: true })}</span>
              <span className="flex items-center gap-2"><MapPin className="size-4 text-gold" aria-hidden />{event.venue}, {event.city}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {can(role, "records.write") && (
                <Button asChild variant="gold" size="sm"><Link href="/deliverables?new=1"><ListChecks /> New deliverable</Link></Button>
              )}
              {can(role, "social.draft") && (
                <Button asChild size="sm" className="bg-white/12 text-white shadow-none hover:bg-white/20"><Link href="/social/compose"><PenSquare /> Compose post</Link></Button>
              )}
              <Button asChild size="sm" className="bg-white/12 text-white shadow-none hover:bg-white/20"><Link href="/meetings"><ClipboardCheck /> Action points</Link></Button>
            </div>
          </div>

          {daysToGo !== null && (
            <div className="shrink-0 lg:text-right">
              {/* The view's one hero figure */}
              <p className="text-[64px] font-extrabold leading-none tracking-tight text-gold sm:text-[84px]">{Math.abs(daysToGo)}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-white/75">
                {daysToGo > 0 ? (daysToGo === 1 ? "day to go" : "days to go") : daysToGo === 0 ? "It's summit day" : daysToGo === -1 ? "day since the summit" : "days since the summit"}
              </p>
              <div className="mt-3 h-1 w-32 rounded-full flag-stripe lg:ml-auto" />
            </div>
          )}
        </div>
      </section>

      {hasRole(role, "admin") && setupSteps.some((s) => !s.done) && <GettingStarted steps={setupSteps} welcome={params.welcome === "1"} />}

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Deliverables completed" value={formatNumber(done)} unit={`of ${items.length}`} icon={CircleCheck} href="/deliverables" meter={{ value: done, max: items.length, tone: "good" }} caption={`${percent(done, items.length)}% complete`} />
        <StatTile label="Overdue deliverables" value={formatNumber(overdue.length)} icon={Flag} tone={overdue.length ? "critical" : "good"} href="/deliverables?due=overdue" caption={overdue.length ? `Oldest was due ${formatDate(overdue[0].due_date)}` : "Nothing is late"} />
        <StatTile label="Panelists confirmed" value={formatNumber(confirmedPanelists)} unit={`of ${people.length}`} icon={MicVocal} href="/panels" meter={{ value: confirmedPanelists, max: people.length, tone: "accent" }} caption={`${people.filter((p) => p.status === "submitted").length} letters awaiting a reply`} />
        <StatTile
          label="Tickets sold"
          value={formatNumber(ticketsSold)}
          unit={targets.tickets ? `of ${formatNumber(targets.tickets)}` : undefined}
          icon={Ticket}
          href="/tickets"
          meter={targets.tickets ? { value: ticketsSold, max: targets.tickets, tone: "gold" } : undefined}
          caption={revenue > 0 ? `${formatMoney(revenue, targets.currency, true)} recorded` : "No sales recorded yet"}
        />
      </section>

      {/* ── Progress + deadlines ─────────────────────────────────────────── */}
      <div className="grid gap-5 lg:gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Progress by workstream" description="Every deliverable on the tracker, by status" action={<Button asChild variant="ghost" size="sm"><Link href="/deliverables">Open tracker <ArrowRight /></Link></Button>} />
          <CardBody>
            <ul className="grid gap-4">
              {(workstreams.data ?? []).map((ws) => {
                const mine = items.filter((d) => d.workstream_id === ws.id);
                const finished = mine.filter((d) => d.status === "completed").length;
                const late = mine.filter((d) => d.status !== "completed" && d.due_date && d.due_date < today).length;
                return (
                  <li key={ws.id}>
                    <Link href={`/deliverables?ws=${ws.slug}`} className="group block rounded-lg">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] font-semibold text-ink group-hover:underline">{ws.name}</span>
                        <span className="tabular shrink-0 text-xs text-ink-3">
                          <strong className="font-bold text-ink">{finished}</strong> of {mine.length} done{late > 0 && <span className="font-semibold text-critical-ink"> · {late} overdue</span>}
                        </span>
                      </div>
                    </Link>
                    <SegmentedBar
                      label={ws.name}
                      segments={DELIVERABLE_PROGRESS_ORDER.map((status) => ({
                        key: status,
                        label: DELIVERABLE_STATUS[status].label,
                        value: mine.filter((d) => d.status === status).length,
                        color: DELIVERABLE_STATUS[status].color,
                      }))}
                    />
                  </li>
                );
              })}
            </ul>
            <Legend
              className="mt-5 border-t border-line pt-4"
              items={DELIVERABLE_PROGRESS_ORDER.map((s) => ({ label: DELIVERABLE_STATUS[s].label, color: DELIVERABLE_STATUS[s].color, value: items.filter((d) => d.status === s).length }))}
            />
          </CardBody>
        </Card>

        <DeadlineChart buckets={buckets} className="xl:col-span-2" />
      </div>

      {/* ── Attention + actions ──────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader title="Needs attention" description={`${overdue.length} overdue · ${dueSoon.length} due in the next 7 days`} action={<Button asChild variant="ghost" size="sm"><Link href="/deliverables?due=overdue">View all <ArrowRight /></Link></Button>} />
          <CardBody className="pt-1">
            {overdue.length + dueSoon.length === 0 ? (
              <EmptyState icon={CircleCheck} title="Nothing is late" description="No overdue deliverables and nothing due this week." className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {[...overdue.slice(0, 5), ...dueSoon.slice(0, Math.max(2, 7 - Math.min(5, overdue.length)))].map((d) => {
                  const late = d.due_date! < today;
                  return (
                    <li key={d.id}>
                      <Link href={`/deliverables?item=${d.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2">
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", late ? "bg-critical-soft text-critical-ink" : "bg-warning-soft text-warning-ink")}>
                          {late ? <Flag className="size-4" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">{d.title}</span>
                          <span className="block truncate text-xs text-ink-3">{d.section}{d.responsibility ? ` · ${d.responsibility}` : ""}</span>
                        </span>
                        <span className={cn("shrink-0 text-right text-xs font-semibold", late ? "text-critical-ink" : "text-ink-2")}>
                          {late ? `${-daysUntil(d.due_date)!}d late` : relativeDay(d.due_date)}
                          <span className="block font-normal text-ink-3">{formatDate(d.due_date, { year: false })}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Open action points" description="From the planning meetings" action={<Button asChild variant="ghost" size="sm"><Link href="/meetings">All actions <ArrowRight /></Link></Button>} />
          <CardBody className="pt-1">
            {(actions.data ?? []).length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="All action points are closed" description="New ones appear here as meetings are minuted." className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {(actions.data ?? []).map((a) => {
                  const meta = ACTION_STATUS[a.status];
                  const late = a.due_date !== null && a.due_date < today;
                  const owner = a.assignee?.full_name ?? a.owner_label ?? "Unassigned";
                  return (
                    <li key={a.id}>
                      <Link href={`/meetings?item=${a.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2">
                        <Avatar name={owner} src={a.assignee?.avatar_url} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">{a.title}</span>
                          <span className="block truncate text-xs text-ink-3">{owner}{a.due_label ? ` · ${a.due_label}` : ""}</span>
                        </span>
                        {late ? <Badge tone="critical" icon={Flag} size="sm">Overdue</Badge> : <Badge tone={meta.tone} icon={meta.icon} size="sm">{meta.label}</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Programme, outreach, commercial ──────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
        <Card>
          <CardHeader title="Panel line-up" description={`${confirmedPanelists} confirmed of ${people.length} approached`} action={<Button asChild variant="ghost" size="icon-sm" aria-label="Open panels"><Link href="/panels"><ArrowRight /></Link></Button>} />
          <CardBody>
            <ul className="grid gap-4">
              {(panels.data ?? []).map((panel) => {
                const mine = people.filter((p) => p.panel_id === panel.id);
                return (
                  <li key={panel.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <Link href={`/panels?panel=${panel.number}`} className="min-w-0 truncate text-[13px] font-semibold text-ink hover:underline" title={panel.title}>
                        Panel {panel.number} <span className="font-normal text-ink-3">· {panel.title.split(":")[0]}</span>
                      </Link>
                      <span className="tabular shrink-0 text-xs text-ink-3"><strong className="text-ink">{mine.filter((p) => p.status === "confirmed").length}</strong>/{mine.length}</span>
                    </div>
                    <SegmentedBar
                      size="sm"
                      label={`Panel ${panel.number}`}
                      segments={(["confirmed", "submitted", "proposed", "declined"] as const).map((s) => ({ key: s, label: PANELIST_STATUS[s].label, value: mine.filter((p) => p.status === s).length, color: PANELIST_STATUS[s].color }))}
                    />
                  </li>
                );
              })}
            </ul>
            <Legend className="mt-4" items={(["confirmed", "submitted", "proposed", "declined"] as const).map((s) => ({ label: PANELIST_STATUS[s].label, color: PANELIST_STATUS[s].color }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Outreach" description={`${reached} of ${contacts.length} invitations sent`} action={<Button asChild variant="ghost" size="icon-sm" aria-label="Open outreach"><Link href="/outreach"><ArrowRight /></Link></Button>} />
          <CardBody>
            <ul className="grid gap-3.5">
              {[...new Set(contacts.map((c) => c.category))].map((category) => {
                const mine = contacts.filter((c) => c.category === category);
                const sent = mine.filter((c) => c.status !== "pending").length;
                return (
                  <li key={category}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                      <span className="truncate font-semibold text-ink">{category}</span>
                      <span className="tabular shrink-0 text-ink-3"><strong className="text-ink">{sent}</strong>/{mine.length}</span>
                    </div>
                    <SegmentedBar
                      size="sm"
                      label={category}
                      segments={(["confirmed", "acknowledged", "submitted", "declined", "pending"] as const).map((s) => ({ key: s, label: OUTREACH_STATUS[s].label, value: mine.filter((c) => c.status === s).length, color: OUTREACH_STATUS[s].color }))}
                    />
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 flex items-center gap-2 text-xs text-ink-3"><Mails className="size-3.5" aria-hidden />{contacts.length - reached} organisations still to be approached</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sponsorship" description={`${confirmedSponsors.length} confirmed · ${pipeline.filter((s) => !["confirmed", "declined"].includes(s.stage)).length} in the pipeline`} action={<Button asChild variant="ghost" size="icon-sm" aria-label="Open sponsorship"><Link href="/sponsorship"><ArrowRight /></Link></Button>} />
          <CardBody>
            {pipeline.length === 0 ? (
              <EmptyState icon={Handshake} title="No sponsors yet" className="py-6" />
            ) : (
              <ul className="grid gap-2.5">
                {pipeline.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <Link href={`/sponsorship?item=${s.id}`} className="min-w-0 truncate text-[13px] font-semibold text-ink hover:underline">{s.organization}</Link>
                    <Badge tone={s.stage === "confirmed" ? "good" : s.stage === "negotiating" ? "warning" : s.stage === "declined" ? "critical" : "neutral"} size="sm">
                      {s.stage === "negotiating" ? "In discussion" : s.stage.replace("_", " ").replace(/^./, (c) => c.toUpperCase())}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-xs font-semibold text-ink-2">Open deliverables by owner</p>
              <ul className="grid gap-2">
                {byOwner.map(([owner, count]) => (
                  <li key={owner} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2.5 text-xs">
                    <span className="truncate text-ink-2">{owner}</span>
                    <Meter value={count} max={ownerMax} label={`${owner}: ${count} open`} size="sm" />
                    <span className="tabular w-6 text-right font-bold text-ink">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ── Coming up + activity ─────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="Coming up" />
          <CardBody className="grid gap-3">
            {nextMeeting ? (
              <Link href={`/meetings?meeting=${nextMeeting.id}`} className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-surface-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                  {nextMeeting.mode === "virtual" ? <Video className="size-4.5" aria-hidden /> : <CalendarDays className="size-4.5" aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-accent-ink">Next meeting · {relativeDay(nextMeeting.meeting_at)}</span>
                  <span className="block truncate text-[13px] font-semibold text-ink">{nextMeeting.title}</span>
                  <span className="block truncate text-xs text-ink-3">{formatDateTime(nextMeeting.meeting_at)}</span>
                </span>
              </Link>
            ) : (
              <p className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-3">No meeting scheduled.</p>
            )}
            {(posts.data ?? []).map((post) => (
              <Link key={post.id} href={`/social/compose?post=${post.id}`} className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-surface-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold-ink"><Rocket className="size-4.5" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-gold-ink">
                    {post.status === "pending_approval" ? "Post awaiting approval" : `Post scheduled · ${post.scheduled_at ? relativeDay(post.scheduled_at) : "unscheduled"}`}
                  </span>
                  <span className="line-clamp-2 text-[13px] font-medium text-ink">{post.content || "Media-only post"}</span>
                </span>
              </Link>
            ))}
            {(posts.data ?? []).length === 0 && (
              <Link href="/social" className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong p-3 text-xs text-ink-3 transition-colors hover:border-accent hover:text-accent-ink">
                <Rocket className="size-4 shrink-0" aria-hidden /> No social posts are scheduled. Plan the pre-event countdown in Social Studio.
              </Link>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Latest activity" description="Everything the team does is logged — and alerted" action={<Button asChild variant="ghost" size="sm"><Link href="/activity">Full log <ArrowRight /></Link></Button>} />
          <CardBody className="pt-1"><ActivityFeed entries={activity.data ?? []} /></CardBody>
        </Card>
      </div>
    </div>
  );
}
