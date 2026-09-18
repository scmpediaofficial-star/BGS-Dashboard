import type { Metadata } from "next";
import { RecordTracker, type TrackerRow } from "@/components/shared/record-tracker";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Sponsorship" };

export default async function SponsorshipPage() {
  const { supabase } = await requireSession();
  const [sponsorsResult, peopleResult, settings] = await Promise.all([
    supabase.from("sponsors").select("id, organization, package, stage, amount, currency, responsibility, owner_id, contact_person, email, phone, next_action, next_action_on, comment, logo_url").order("sort_order"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"), getSettings(),
  ]);
  const sponsors = sponsorsResult.data ?? [];
  const rows: TrackerRow[] = sponsors.map((x) => ({ id: x.id, title: x.organization, subtitle: [x.package, x.amount !== null ? formatMoney(x.amount, x.currency) : null].filter(Boolean).join(" · "), group: x.package ?? "Unassigned", status: x.stage,
    values: { organization: x.organization, package: x.package, stage: x.stage, amount: x.amount, currency: x.currency, responsibility: x.responsibility, owner_id: x.owner_id,
      contact_person: x.contact_person, email: x.email, phone: x.phone, next_action: x.next_action, next_action_on: x.next_action_on, comment: x.comment, logo_url: x.logo_url } }));
  const confirmed = sponsors.filter((s) => s.stage === "confirmed");
  const pipeline = sponsors.filter((s) => s.stage !== "declined" && s.currency === "GHS");
  return <RecordTracker kind="sponsorship" rows={rows} groups={[...new Set(sponsors.map((s) => s.package ?? "Unassigned"))].map((value) => ({ value, label: value }))} groupLabel="Package"
    eyebrow="Commercial" title="Sponsorship" description="Track prospects, proposals, conversations and confirmed funding." table="sponsors"
    extra={<div className="mb-4 grid gap-3 sm:grid-cols-2"><Card className="p-4"><p className="text-xs text-ink-3">Confirmed sponsors</p><p className="mt-1 text-2xl font-extrabold text-ink">{confirmed.length}</p></Card><Card className="p-4"><p className="text-xs text-ink-3">Known GHS pipeline value</p><p className="mt-1 text-2xl font-extrabold text-ink">{formatMoney(pipeline.reduce((sum, s) => sum + (s.amount ?? 0), 0))}</p></Card></div>}
    fields={[{ name: "organization", label: "Organisation", required: true }, { name: "package", label: "Package", kind: "select", options: settings.sponsor_packages.map((value) => ({ value, label: value })) },
      { name: "stage", label: "Stage", kind: "select", required: true, options: ["prospect", "approached", "proposal_sent", "negotiating", "confirmed", "declined"].map((value) => ({ value, label: value.replaceAll("_", " ") })) },
      { name: "amount", label: "Amount", kind: "number" }, { name: "currency", label: "Currency", kind: "select", options: [{ value: "GHS", label: "GHS" }, { value: "USD", label: "USD" }] },
      { name: "responsibility", label: "Responsibility" }, { name: "owner_id", label: "Team owner", kind: "select", options: (peopleResult.data ?? []).map((p) => ({ value: p.id, label: p.full_name })) },
      { name: "contact_person", label: "Contact person" }, { name: "email", label: "Email", kind: "email" }, { name: "phone", label: "Phone" },
      { name: "next_action", label: "Next action" }, { name: "next_action_on", label: "Next action due", kind: "date" }, { name: "comment", label: "Notes", kind: "textarea" },
      { name: "logo_url", label: "Logo", kind: "image" }]} />;
}
