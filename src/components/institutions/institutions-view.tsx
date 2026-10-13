"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Coins, Plus, Search, Tag, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { addMember, assignMembers, deleteInstitution, removeMember, saveInstitution, setInstitutionLogo } from "@/app/(app)/institutions/actions";
import type { Institution, MemberSale } from "@/components/institutions/types";
import { useViewer } from "@/components/shell/session-context";
import { ImageUpload } from "@/components/shared/image-upload";
import { useAction } from "@/components/shared/use-action";
import { StatTile } from "@/components/charts/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { PAYMENT_STATUS } from "@/lib/domain";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { formatDate, formatMoney, formatNumber, pluralize } from "@/lib/utils";

type Props = { institutions: Institution[]; sales: MemberSale[]; openId: string | null; directPrice: number };
type Draft = { name: string; short_name: string; contact_person: string; email: string; phone: string; fee: string; notes: string };
const draftOf = (i: Institution): Draft => ({ name: i.name, short_name: i.short_name ?? "", contact_person: i.contact_person ?? "", email: i.email ?? "", phone: i.phone ?? "", fee: i.fee === null ? "" : String(i.fee), notes: i.notes ?? "" });
const ghs = (list: MemberSale[]) => list.filter((s) => s.currency === "GHS" && s.payment_status === "paid").reduce((n, s) => n + s.amount, 0);

/** Bodies that pay for their members outside Paystack, and the members each one has paid for. */
export function InstitutionsView({ institutions, sales, openId, directPrice }: Props) {
  const { can } = useViewer();
  const manage = can("tickets.manage");
  useRealtimeRefresh(["institutions", "ticket_sales", "tickets"]);
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const open = (id: string | null) => { const q = new URLSearchParams(params.toString()); if (id) q.set("item", id); else q.delete("item"); router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false }); };

  const membersBy = useMemo(() => { const m = new Map<string, MemberSale[]>(); for (const s of sales) if (s.institution_id) m.set(s.institution_id, [...(m.get(s.institution_id) ?? []), s]); return m; }, [sales]);
  const untagged = useMemo(() => sales.filter((s) => !s.institution_id && s.payment_status === "paid"), [sales]);
  const tagged = useMemo(() => sales.filter((s) => s.institution_id), [sales]);
  const selected = institutions.find((i) => i.id === openId) ?? null;
  const members = selected ? membersBy.get(selected.id) ?? [] : [];

  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagAllTo, setTagAllTo] = useState("");
  const [member, setMember] = useState({ buyer_name: "", buyer_email: "", buyer_phone: "", amount: "" });
  // The sheet edits a copy and saves field by field as you leave each one.
  const [draftState, setDraftState] = useState<{ key: string; values: Draft }>({ key: "", values: draftOf({ id: "", name: "", short_name: null, logo_url: null, contact_person: null, email: null, phone: null, fee: null, notes: null, created_at: "" }) });
  const draft = selected && draftState.key === selected.id ? draftState.values : selected ? draftOf(selected) : draftState.values;
  const setDraft = (values: Draft) => selected && setDraftState({ key: selected.id, values });

  const [create, creating] = useAction(saveInstitution, { success: "Institution added", onSuccess: ({ id }) => { setNewName(""); open(id); } });
  const [save] = useAction(saveInstitution, { success: "Saved" });
  const [remove, removing] = useAction(deleteInstitution, { success: "Institution removed", onSuccess: () => { setConfirmDelete(false); open(null); } });
  const [add, adding] = useAction(addMember, {
    success: ({ code, customerCode, amount }) => `Ticket ${code ?? "issued"} · ${formatMoney(amount)}${customerCode ? ` · Paystack ${customerCode}` : ""}`,
    onSuccess: () => setMember({ buyer_name: "", buyer_email: "", buyer_phone: "", amount: "" }),
  });
  const [assign, assigning] = useAction(assignMembers, { success: ({ count }) => `${pluralize(count, "member")} tagged` });
  const [untag] = useAction(removeMember, { success: "Member untagged" });
  const [saveLogo] = useAction(setInstitutionLogo, { success: "Logo saved" });

  function autosave(field: keyof Draft) {
    if (!selected) return;
    const before = draftOf(selected);
    if (draft[field] === before[field]) return;
    if (field === "name" && !draft.name.trim()) { toast.error("The institution needs a name."); setDraft({ ...draft, name: selected.name }); return; }
    save({ id: selected.id, ...draft, fee: draft.fee.trim() === "" ? null : Number(draft.fee) });
  }

  const filtered = institutions.filter((i) => `${i.name} ${i.contact_person ?? ""} ${i.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const feeOf = (i: Institution) => i.fee ?? directPrice;

  return (
    <>
      <PageHeader eyebrow="Commercial" title="Institutions" description="Bodies that pay for their members outside Paystack. Add a member here and the ticket is issued, the fee recorded and a Paystack customer code created in one go." />

      <section aria-label="Institutions at a glance" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Institutions" value={formatNumber(institutions.length)} icon={Building2} caption={institutions.length ? `${formatNumber(institutions.filter((i) => membersBy.has(i.id)).length)} with members` : "None added yet"} />
        <StatTile label="Members paid for" value={formatNumber(tagged.reduce((n, s) => n + s.quantity, 0))} icon={UsersRound} caption="Tickets paid by an institution" />
        <StatTile label="Paid by institutions" value={formatMoney(ghs(tagged), "GHS", true)} icon={Coins} tone="good" href="/tickets?tab=sales" caption="Counted in the actual total" />
        <StatTile label="Not tagged yet" value={formatNumber(untagged.length)} icon={Tag} tone={untagged.length ? "critical" : "good"} caption={untagged.length ? "Paid outside Paystack, no institution" : "Every outside payment has its institution"} />
      </section>

      {manage && (
        <Card className="mb-4 p-4">
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create({ name: newName.trim() }); }}>
            <Field label="Add an institution" htmlFor="inst-new" className="min-w-0 flex-1" hint={`Members are recorded at ${formatMoney(directPrice)} each unless the institution has its own fee.`}><Input id="inst-new" placeholder="e.g. Ghana Bar Association" autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
            <Button type="submit" loading={creating} disabled={!newName.trim()} className="sm:mb-[22px]"><Plus /> Add</Button>
          </form>
        </Card>
      )}

      {untagged.length > 0 && (
        <Card className="mb-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div><h2 className="text-sm font-bold text-ink">Paid outside Paystack, not yet tagged</h2><p className="text-xs text-ink-3">{pluralize(untagged.length, "sale")} · {formatMoney(ghs(untagged))}. Tag each one to the institution that paid.</p></div>
            {manage && institutions.length > 0 && (
              <div className="flex items-center gap-2">
                <Select aria-label="Tag everyone below to" className="w-56" value={tagAllTo} onChange={(e) => setTagAllTo(e.target.value)}><option value="">Tag all of them to…</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>
                <Button variant="outline" size="sm" loading={assigning} disabled={!tagAllTo} onClick={() => assign({ institution_id: tagAllTo, sale_ids: untagged.map((s) => s.id) })}><Tag /> Tag all</Button>
              </div>
            )}
          </div>
          <ul className="divide-y divide-line">
            {untagged.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-ink">{s.buyer_name}</p><p className="truncate text-xs text-ink-3">{[s.buyer_email, s.organization, formatMoney(s.amount, s.currency), formatDate(s.sold_at)].filter(Boolean).join(" · ")}</p></div>
                {manage && institutions.length > 0 ? <Select aria-label={`Tag ${s.buyer_name} to an institution`} className="w-52" value="" onChange={(e) => { if (e.target.value) assign({ institution_id: e.target.value, sale_ids: [s.id] }); }}><option value="">Tag to…</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select> : <Badge>Untagged</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-3 relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input aria-label="Search institutions" placeholder="Search institutions…" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Building2} title={institutions.length ? "No institution matches" : "No institutions yet"} description={institutions.length ? "Try another name." : "Add the first one above, then add its members or tag the sales already paid outside Paystack."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3"><tr><th className="px-5 py-3">Institution</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Members</th><th className="px-3 py-3">Fee each</th><th className="px-5 py-3">Paid</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((i) => { const m = membersBy.get(i.id) ?? []; return (
                    <tr key={i.id} className="hover:bg-surface-2">
                      <td className="px-5 py-3"><div className="flex items-center gap-3"><Logo url={i.logo_url} /><button onClick={() => open(i.id)} className="text-left text-[13px] font-bold text-ink hover:text-accent-ink">{i.name}</button></div></td>
                      <td className="px-3 py-3 text-ink-2">{i.contact_person ?? "—"}{i.email && <p className="text-ink-3">{i.email}</p>}</td>
                      <td className="px-3 py-3 font-semibold text-ink">{formatNumber(m.reduce((n, s) => n + s.quantity, 0))}</td>
                      <td className="px-3 py-3 text-ink-2">{formatMoney(feeOf(i))}{i.fee === null && <span className="text-ink-3"> (default)</span>}</td>
                      <td className="px-5 py-3 font-semibold text-ink">{formatMoney(ghs(m))}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {filtered.map((i) => { const m = membersBy.get(i.id) ?? []; return (
                <li key={i.id} className="flex items-center gap-3 p-4"><Logo url={i.logo_url} /><button className="block min-w-0 flex-1 text-left" onClick={() => open(i.id)}><span className="block text-[13px] font-bold text-ink">{i.name}</span><span className="mt-0.5 block text-xs text-ink-3">{pluralize(m.reduce((n, s) => n + s.quantity, 0), "member")} · {formatMoney(ghs(m))} · {formatMoney(feeOf(i))} each</span></button></li>
              ); })}
            </ul>
          </>
        )}
      </Card>

      {/* ── One institution ───────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) open(null); }}>
        {selected && (
          <SheetContent title={selected.name} description={`${pluralize(members.reduce((n, s) => n + s.quantity, 0), "member")} · ${formatMoney(ghs(members))} paid · added ${formatDate(selected.created_at)}`}
            footer={<><Button variant="outline" onClick={() => open(null)}>Close</Button>{manage && <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 /> Remove institution</Button>}</>}>
            <div className="grid gap-4">
              <p className="text-xs text-ink-3">Changes save as you leave each field.</p>
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <ImageUpload value={selected.logo_url} folder="institutions" fit="contain" label="Logo" disabled={!manage} onChange={(url) => saveLogo({ id: selected.id, url })} />
                <p className="mt-2 text-xs text-ink-3">Printed top right on the certificate of every member of this institution. A square or round logo on a white or transparent background works best.</p>
              </div>
              <Field label="Name" htmlFor="inst-name"><Input id="inst-name" required disabled={!manage} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={() => autosave("name")} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Short name" htmlFor="inst-short" optional hint="How members write it, e.g. ICAG. Used to match them to this institution."><Input id="inst-short" disabled={!manage} value={draft.short_name} onChange={(e) => setDraft({ ...draft, short_name: e.target.value })} onBlur={() => autosave("short_name")} /></Field>
                <Field label="Contact person" htmlFor="inst-contact" optional><Input id="inst-contact" disabled={!manage} value={draft.contact_person} onChange={(e) => setDraft({ ...draft, contact_person: e.target.value })} onBlur={() => autosave("contact_person")} /></Field>
                <Field label="Fee per member (GHS)" htmlFor="inst-fee" optional hint={`Blank uses the default, ${formatMoney(directPrice)}.`}><Input id="inst-fee" type="number" inputMode="decimal" min="0" step="0.01" disabled={!manage} value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} onBlur={() => autosave("fee")} /></Field>
                <Field label="Email" htmlFor="inst-email" optional><Input id="inst-email" type="email" disabled={!manage} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} onBlur={() => autosave("email")} /></Field>
                <Field label="Phone" htmlFor="inst-phone" optional><Input id="inst-phone" inputMode="tel" disabled={!manage} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} onBlur={() => autosave("phone")} /></Field>
              </div>
              <Field label="Notes" htmlFor="inst-notes" optional><Textarea id="inst-notes" rows={2} disabled={!manage} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} onBlur={() => autosave("notes")} /></Field>
            </div>

            {manage && (
              <form className="mt-5 grid gap-3 rounded-xl border border-line bg-surface-2 p-4" onSubmit={(e) => { e.preventDefault(); add({ institution_id: selected.id, ...member, amount: member.amount.trim() === "" ? null : Number(member.amount) }); }}>
                <div className="flex items-center gap-2"><UserPlus aria-hidden className="size-4 text-accent-ink" /><h3 className="text-[13px] font-bold text-ink">Add a member</h3></div>
                <p className="text-xs text-ink-3">Saved as a paid ticket at {formatMoney(feeOf(selected))}. The ticket number is issued at once; with an email, a Paystack customer code is created too.</p>
                <Field label="Full name" htmlFor="member-name"><Input id="member-name" required autoComplete="off" value={member.buyer_name} onChange={(e) => setMember({ ...member, buyer_name: e.target.value })} /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Email" htmlFor="member-email" optional><Input id="member-email" type="email" value={member.buyer_email} onChange={(e) => setMember({ ...member, buyer_email: e.target.value })} /></Field>
                  <Field label="Phone" htmlFor="member-phone" optional><Input id="member-phone" inputMode="tel" value={member.buyer_phone} onChange={(e) => setMember({ ...member, buyer_phone: e.target.value })} /></Field>
                  <Field label="Fee paid" htmlFor="member-fee" optional hint={`Blank = ${formatMoney(feeOf(selected))}`}><Input id="member-fee" type="number" inputMode="decimal" min="0" step="0.01" value={member.amount} onChange={(e) => setMember({ ...member, amount: e.target.value })} /></Field>
                </div>
                <div><Button type="submit" loading={adding} disabled={!member.buyer_name.trim()}><Plus /> Add member and issue ticket</Button></div>
              </form>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-[13px] font-bold text-ink">Members</h3>
              {members.length === 0 ? <p className="mt-2 text-xs text-ink-3">Nobody tagged yet. Add a member above, or tag sales paid outside Paystack from the list on the main page.</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {members.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink"><Link href={`/tickets?tab=sales&item=${s.id}`} className="hover:text-accent-ink">{s.buyer_name}</Link>{s.quantity > 1 ? ` × ${s.quantity}` : ""}</p>
                        <p className="truncate text-xs text-ink-3">{[s.buyer_email, s.buyer_phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          {s.codes.map((c) => <span key={c} className="font-mono font-semibold text-ink">{c}</span>)}
                          {s.paystack_customer_code ? <Link href={`/payments?tab=customers&customer=${s.paystack_customer_code}`} className="font-mono text-ink-3 hover:text-accent-ink">{s.paystack_customer_code}</Link> : <span className="text-ink-3">no Paystack code{s.buyer_email ? " yet" : " — add an email"}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs font-semibold text-ink">{formatMoney(s.amount, s.currency)}</span>
                        <Badge tone={PAYMENT_STATUS[s.payment_status].tone} icon={PAYMENT_STATUS[s.payment_status].icon} size="sm">{PAYMENT_STATUS[s.payment_status].label}</Badge>
                        {manage && <button className="text-[11px] text-ink-3 hover:text-critical-ink" onClick={() => untag(s.id)} aria-label={`Untag ${s.buyer_name}`}><X aria-hidden className="inline size-3" /> untag</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </SheetContent>
        )}
      </Dialog>

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Remove this institution?" destructive confirmLabel="Remove" loading={removing}
        description={`“${selected?.name ?? ""}” is removed from the list. Its members keep their tickets and sales; they just stop being tagged to it.`} onConfirm={() => { if (selected) remove(selected.id); }} />
    </>
  );
}

/** The institution's logo as a small tile; a placeholder until one is uploaded. */
function Logo({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage or bundled brand logo, host varies
    <img src={url} alt="" className="size-9 shrink-0 rounded-md border border-line bg-white object-contain p-0.5" />
  ) : <span className="grid size-9 shrink-0 place-items-center rounded-md border border-dashed border-line-strong text-ink-3" title="No logo yet"><Building2 className="size-4" aria-hidden /></span>;
}
