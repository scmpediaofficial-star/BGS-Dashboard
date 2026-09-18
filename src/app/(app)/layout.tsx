import { InstallPrompt } from "@/components/pwa/install-prompt";
import { MobileTabs } from "@/components/shell/mobile-tabs";
import { OfflineBanner } from "@/components/shell/offline-banner";
import { SessionProvider, type Viewer } from "@/components/shell/session-context";
import { Sidebar, type NavBadges } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { daysUntil, formatDate, isoDay } from "@/lib/utils";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile, supabase } = await requireSession();
  const today = isoDay();

  const [settings, overdue, actions, approvals, unread] = await Promise.all([
    getSettings(),
    supabase.from("deliverables").select("id", { count: "exact", head: true }).neq("status", "completed").lt("due_date", today),
    supabase.from("action_items").select("id", { count: "exact", head: true }).neq("status", "done"),
    supabase.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);

  const viewer: Viewer = {
    id: profile.id,
    name: profile.full_name || profile.email,
    email: profile.email,
    role: profile.role,
    avatarUrl: profile.avatar_url,
    organization: profile.organization,
  };
  const badges: NavBadges = { overdue: overdue.count ?? 0, actions: actions.count ?? 0, approvals: approvals.count ?? 0 };
  const { event } = settings;
  const eventLine = `${formatDate(event.starts_at)} · ${event.venue}`;

  return (
    <SessionProvider viewer={viewer}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-fg">
        Skip to content
      </a>
      <Sidebar badges={badges} eventLine={eventLine} />
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <OfflineBanner />
        <Topbar badges={badges} unread={unread.count ?? 0} daysToGo={daysUntil(event.starts_at)} eventLine={eventLine} />
        <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">
          {children}
        </main>
      </div>
      <MobileTabs badges={badges} />
      <InstallPrompt />
    </SessionProvider>
  );
}
