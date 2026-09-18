import type { Metadata } from "next";
import { RecordTracker, type TrackerRow } from "@/components/shared/record-tracker";
import { requireSession } from "@/lib/auth/session";
import { PanelProgramme } from "@/components/panels/panel-programme";

export const metadata: Metadata = { title: "Panels & speakers" };

export default async function PanelsPage() {
  const { supabase } = await requireSession();
  const [panelResult, speakerResult, questionResult] = await Promise.all([
    supabase.from("panels").select("id, number, title, perspective, moderator, starts_at, duration_minutes, notes").order("number"),
    supabase.from("panelists").select("id, panel_id, full_name, job_title, organization, status, email, phone, photo_url, bio, citation, photo_received, bio_received, artwork_done, citation_done, notes").order("sort_order"),
    supabase.from("panel_questions").select("id, panel_id, question, sort_order").order("sort_order"),
  ]);
  const panels = panelResult.data ?? [];
  const speakers = speakerResult.data ?? [];
  const groups = panels.map((p) => ({ value: p.id, label: `Panel ${p.number}: ${p.title}` }));
  const rows: TrackerRow[] = speakers.map((p) => ({ id: p.id, title: p.full_name, subtitle: [p.job_title, p.organization].filter(Boolean).join(" · "), group: p.panel_id, status: p.status,
    values: { panel_id: p.panel_id, full_name: p.full_name, job_title: p.job_title, organization: p.organization, status: p.status, email: p.email,
      phone: p.phone, photo_url: p.photo_url, bio: p.bio, citation: p.citation, photo_received: p.photo_received, bio_received: p.bio_received,
      artwork_done: p.artwork_done, citation_done: p.citation_done, notes: p.notes } }));
  return <RecordTracker kind="panelists" rows={rows} groups={groups} groupLabel="Panel" title="Panels & speakers" eyebrow="Programme"
    description="Track invitations, confirmations, photographs, biographies and citations for every panel."
    table="panelists" extra={<PanelProgramme key="programme" panels={panels} questions={questionResult.data ?? []} speakers={speakers.map((s) => ({ panel_id: s.panel_id, status: s.status }))} />}
    fields={[
      { name: "panel_id", label: "Panel", kind: "select", required: true, options: groups },
      { name: "full_name", label: "Full name", required: true }, { name: "job_title", label: "Job title" }, { name: "organization", label: "Organisation" },
      { name: "status", label: "Invitation status", kind: "select", required: true, options: [{ value: "proposed", label: "Proposed" }, { value: "submitted", label: "Letter submitted" }, { value: "confirmed", label: "Confirmed" }, { value: "declined", label: "Declined" }] },
      { name: "email", label: "Email", kind: "email" }, { name: "phone", label: "Phone" }, { name: "photo_url", label: "Photograph", kind: "image" },
      { name: "bio", label: "Biography", kind: "textarea" }, { name: "citation", label: "Citation", kind: "textarea" },
      { name: "photo_received", label: "Photograph received", kind: "checkbox" }, { name: "bio_received", label: "Biography received", kind: "checkbox" },
      { name: "artwork_done", label: "Artwork done", kind: "checkbox" }, { name: "citation_done", label: "Citation prepared", kind: "checkbox" },
      { name: "notes", label: "Notes", kind: "textarea" },
    ]} />;
}
