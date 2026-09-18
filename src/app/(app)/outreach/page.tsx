import type { Metadata } from "next";
import { RecordTracker, type TrackerRow } from "@/components/shared/record-tracker";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Outreach" };

export default async function OutreachPage() {
  const { supabase } = await requireSession();
  const { data } = await supabase.from("outreach_contacts").select("id, list, category, name, status, contact_person, email, phone, notes, submitted_on, follow_up_on").order("list").order("sort_order");
  const rows: TrackerRow[] = (data ?? []).map((x) => ({ id: x.id, title: x.name, subtitle: [x.category, x.contact_person].filter(Boolean).join(" · "), group: x.list, status: x.status,
    values: { list: x.list, category: x.category, name: x.name, status: x.status, contact_person: x.contact_person, email: x.email, phone: x.phone,
      notes: x.notes, submitted_on: x.submitted_on, follow_up_on: x.follow_up_on } }));
  return <RecordTracker kind="outreach" rows={rows} groups={[{ value: "letters", label: "Invitation letters" }, { value: "embassies", label: "Embassies" }]} groupLabel="List"
    eyebrow="Programme" title="Outreach" description="Track letters, embassy invitations, responses and follow-up dates." table="outreach_contacts"
    fields={[{ name: "list", label: "List", kind: "select", required: true, options: [{ value: "letters", label: "Invitation letters" }, { value: "embassies", label: "Embassies" }] },
      { name: "category", label: "Category", required: true }, { name: "name", label: "Organisation", required: true },
      { name: "status", label: "Status", kind: "select", required: true, options: ["pending", "submitted", "acknowledged", "confirmed", "declined"].map((value) => ({ value, label: value.replaceAll("_", " ") })) },
      { name: "contact_person", label: "Contact person" }, { name: "email", label: "Email", kind: "email" }, { name: "phone", label: "Phone" },
      { name: "submitted_on", label: "Submitted on", kind: "date" }, { name: "follow_up_on", label: "Follow up on", kind: "date" }, { name: "notes", label: "Notes", kind: "textarea" }]} />;
}
