"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { savePanelist, setPanelistStatus, deletePanelist } from "@/app/(app)/panels/actions";
import { saveContact, setContactStatus, deleteContact } from "@/app/(app)/outreach/actions";
import { saveSponsor, setSponsorStage, deleteSponsor } from "@/app/(app)/sponsorship/actions";
import { saveActionItem, setActionItemStatus, deleteActionItem } from "@/app/(app)/meetings/actions";
import { Comments, type CommentEntity } from "@/components/shared/comments";
import { ImageUpload } from "@/components/shared/image-upload";
import { StatusMenu } from "@/components/shared/status-menu";
import { useAction } from "@/components/shared/use-action";
import { useViewer } from "@/components/shell/session-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, FilterChip, PageHeader } from "@/components/ui/misc";
import { ACTION_STATUS, ACTION_STATUS_ORDER, OUTREACH_STATUS, OUTREACH_STATUS_ORDER, PANELIST_STATUS, PANELIST_STATUS_ORDER, SPONSOR_STAGE, SPONSOR_STAGE_ORDER, type Meta } from "@/lib/domain";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { isoDay, toCsv } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions";

type Value = string | number | boolean | null;
export type TrackerRow = { id: string; title: string; subtitle?: string | null; group: string; status: string; values: Record<string, Value> };
export type TrackerOption = { value: string; label: string };
type FieldSpec = { name: string; label: string; kind?: "text" | "textarea" | "email" | "date" | "number" | "select" | "checkbox" | "image"; required?: boolean; options?: TrackerOption[] };
type Kind = "panelists" | "outreach" | "sponsorship" | "actions";
type Props = { kind: Kind; rows: TrackerRow[]; groups?: TrackerOption[]; groupLabel?: string; fields: FieldSpec[]; title: string; description: string; eyebrow: string; table: string; extra?: React.ReactNode };

const CONFIG: Record<Kind, { singular: string; statusName: string; status: Record<string, Meta>; order: string[]; entity: CommentEntity; path: string; empty: string }> = {
  panelists: { singular: "speaker", statusName: "status", status: PANELIST_STATUS, order: PANELIST_STATUS_ORDER, entity: "panelist", path: "/panels", empty: "No speakers match these filters." },
  outreach: { singular: "contact", statusName: "status", status: OUTREACH_STATUS, order: OUTREACH_STATUS_ORDER, entity: "outreach", path: "/outreach", empty: "No contacts match these filters." },
  sponsorship: { singular: "sponsor", statusName: "stage", status: SPONSOR_STAGE, order: SPONSOR_STAGE_ORDER, entity: "sponsor", path: "/sponsorship", empty: "No sponsors match these filters." },
  actions: { singular: "action point", statusName: "status", status: ACTION_STATUS, order: ACTION_STATUS_ORDER, entity: "action_item", path: "/meetings", empty: "No action points match these filters." },
};

const SAVE: Record<Kind, (input: Record<string, unknown>) => Promise<ActionResult<{ id: string }>>> = { panelists: savePanelist, outreach: saveContact, sponsorship: saveSponsor, actions: saveActionItem };
const STATUS: Record<Kind, (id: string, status: string) => Promise<ActionResult>> = { panelists: setPanelistStatus, outreach: setContactStatus, sponsorship: setSponsorStage, actions: setActionItemStatus };
const DELETE: Record<Kind, (id: string) => Promise<ActionResult>> = { panelists: deletePanelist, outreach: deleteContact, sponsorship: deleteSponsor, actions: deleteActionItem };

export function RecordTracker({ kind, rows, groups = [], groupLabel = "Group", fields, title, description, eyebrow, table, extra }: Props) {
  const config = CONFIG[kind];
  const { can } = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useRealtimeRefresh([table]);
  const selectedId = params.get("item");
  const creating = params.get("new") === "1";
  const group = params.get("group") ?? "all";
  const statusFilter = params.get("status") ?? "all";
  const [search, setSearch] = useState("");
  const [draftState, setDraftState] = useState<{ key: string; values: Record<string, Value> }>({ key: "", values: {} });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selected = selectedId ? rows.find((row) => row.id === selectedId) ?? null : null;
  const formKey = selectedId ?? (creating ? "new" : "");
  const defaults = selected ? selected.values : Object.fromEntries(fields.map((f) => [f.name, f.kind === "checkbox" ? false : ""]));
  const form = draftState.key === formKey ? draftState.values : defaults;
  const setForm = (values: Record<string, Value>) => setDraftState({ key: formKey, values });

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) { if (value && value !== "all") next.set(key, value); else next.delete(key); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [params, pathname, router]);
  const visible = useMemo(() => rows.filter((row) =>
    (group === "all" || row.group === group) && (statusFilter === "all" || row.status === statusFilter) &&
    (!search.trim() || `${row.title} ${row.subtitle ?? ""} ${Object.values(row.values).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()))
  ), [rows, group, statusFilter, search]);
  const counts = Object.fromEntries(config.order.map((s) => [s, rows.filter((r) => r.status === s && (group === "all" || r.group === group)).length]));
  const [save, saving] = useAction(SAVE[kind], { success: "Saved", onSuccess: ({ id }) => setParams({ new: null, item: id }) });
  const [changeStatus] = useAction(STATUS[kind], { success: "Status updated" });
  const [remove, removing] = useAction(DELETE[kind], { success: "Removed", onSuccess: () => { setConfirmDelete(false); setParams({ item: null }); } });
  function open(row?: TrackerRow) { setDraftState({ key: row?.id ?? "new", values: row ? { ...row.values } : Object.fromEntries(fields.map((f) => [f.name, f.kind === "checkbox" ? false : ""])) }); setParams({ item: row?.id ?? null, new: row ? null : "1" }); }
  function exportCsv() {
    const csv = toCsv([["Name", groupLabel, "Status", ...fields.map((f) => f.label)], ...visible.map((r) => [r.title, r.group, config.status[r.status]?.label ?? r.status, ...fields.map((f) => String(r.values[f.name] ?? ""))])]);
    const href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href, download: `bgs-${kind}-${isoDay()}.csv` }); a.click(); URL.revokeObjectURL(href);
  }
  const edit = creating || !!selected;
  const rowTitle = selected?.title ?? `New ${config.singular}`;

  return <>
    <PageHeader eyebrow={eyebrow} title={title} description={description} actions={<><Button variant="outline" onClick={exportCsv}><Download /> Export</Button>{can("records.write") && <Button onClick={() => open()}><Plus /> New {config.singular}</Button>}</>} />
    {extra}
    <Card className="mb-4 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-ink-3">{group === "all" ? `All ${title.toLowerCase()}` : groups.find((x) => x.value === group)?.label ?? group}</p><p className="text-2xl font-extrabold text-ink">{visible.length}<span className="ml-2 text-sm font-medium text-ink-3">shown of {rows.length}</span></p></div><div className="flex flex-wrap gap-2">{config.order.map((s) => <Badge key={s} tone={config.status[s].tone} icon={config.status[s].icon}>{counts[s]} {config.status[s].label}</Badge>)}</div></div></Card>
    <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-ink-3" aria-hidden /><Input aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}…`} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>{groups.length > 0 && <Select aria-label={groupLabel} value={group} onChange={(e) => setParams({ group: e.target.value })}><option value="all">All {groupLabel.toLowerCase()}s</option>{groups.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select>}</div>
    <div className="scroll-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"><FilterChip active={statusFilter === "all"} count={rows.filter((r) => group === "all" || r.group === group).length} onClick={() => setParams({ status: null })}>All</FilterChip>{config.order.map((s) => <FilterChip key={s} active={statusFilter === s} count={counts[s]} onClick={() => setParams({ status: s })}>{config.status[s].label}</FilterChip>)}</div>
    <Card className="overflow-hidden">{visible.length === 0 ? <EmptyState icon={Search} title={config.empty} description="Try another filter or create a new record." /> : <>
      <div className="divide-y divide-line md:hidden">{visible.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
        <button type="button" onClick={() => open(row)} className="min-w-0 flex-1 text-left"><span className="block truncate text-[13px] font-bold text-ink hover:text-accent-ink">{row.title}</span>{row.subtitle && <span className="block truncate text-xs text-ink-3">{row.subtitle}</span>}<span className="mt-1 block truncate text-xs text-ink-3">{groups.find((g) => g.value === row.group)?.label ?? row.group}</span></button>
        <StatusMenu value={row.status} meta={config.status} order={config.order} label={row.title} disabled={!can("records.write")} onChange={(status) => changeStatus(row.id, status)} />
        <Button size="sm" variant="ghost" onClick={() => open(row)}>Open</Button>
      </div>)}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed text-left"><colgroup><col className="w-[40%]" /><col className="w-[25%]" /><col className="w-[23%]" /><col className="w-[12%]" /></colgroup><thead className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-ink-3"><tr><th scope="col" className="px-5 py-3">Name</th><th scope="col" className="px-3 py-3">{groupLabel}</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3">Details</th></tr></thead><tbody className="divide-y divide-line">{visible.map((row) => <tr key={row.id} className="align-middle"><th scope="row" className="px-5 py-3.5 font-normal"><button type="button" onClick={() => open(row)} className="block w-full min-w-0 text-left"><span className="block truncate text-[13px] font-bold text-ink hover:text-accent-ink">{row.title}</span>{row.subtitle && <span className="block truncate text-xs text-ink-3">{row.subtitle}</span>}</button></th><td className="truncate px-3 py-3.5 text-xs text-ink-2">{groups.find((g) => g.value === row.group)?.label ?? row.group}</td><td className="px-3 py-3.5"><StatusMenu value={row.status} meta={config.status} order={config.order} label={row.title} disabled={!can("records.write")} onChange={(status) => changeStatus(row.id, status)} /></td><td className="px-3 py-3.5"><Button size="sm" variant="ghost" onClick={() => open(row)}>Open</Button></td></tr>)}</tbody></table></div>
    </>}</Card>
    <Dialog open={edit} onOpenChange={(value) => { if (!value) setParams({ item: null, new: null }); }}><SheetContent title={rowTitle} description={selected?.subtitle ?? `Add a ${config.singular} to the summit workspace.`} footer={can("records.write") ? <><Button variant="outline" onClick={() => setParams({ item: null, new: null })}>Close</Button>{selected && can("records.delete") && <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>}<Button form="tracker-form" type="submit" loading={saving}>Save {config.singular}</Button></> : undefined}>
      <form id="tracker-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save({ ...form, ...(selected ? { id: selected.id } : {}) }); }}>
        {fields.map((field) => <Field key={field.name} label={field.label} htmlFor={`track-${field.name}`} optional={!field.required}>{field.kind === "select" ? <Select id={`track-${field.name}`} disabled={!can("records.write")} value={String(form[field.name] ?? "")} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}><option value="">Select…</option>{field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select> : field.kind === "textarea" ? <Textarea id={`track-${field.name}`} disabled={!can("records.write")} value={String(form[field.name] ?? "")} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} /> : field.kind === "checkbox" ? <input id={`track-${field.name}`} type="checkbox" className="size-5 accent-accent" disabled={!can("records.write")} checked={Boolean(form[field.name])} onChange={(e) => setForm({ ...form, [field.name]: e.target.checked })} /> : field.kind === "image" ? <ImageUpload folder={kind === "panelists" ? "panelists" : "sponsors"} label={field.label} value={String(form[field.name] ?? "") || null} onChange={(url) => setForm({ ...form, [field.name]: url })} disabled={!can("records.write")} /> : <Input id={`track-${field.name}`} type={field.kind === "email" || field.kind === "date" || field.kind === "number" ? field.kind : "text"} disabled={!can("records.write")} required={field.required} value={String(form[field.name] ?? "")} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} />}</Field>)}
      </form>
      {selected && <div className="mt-7 border-t border-line pt-5"><Comments entityType={config.entity} entityId={selected.id} entityLabel={selected.title} link={`${config.path}?item=${selected.id}`} /></div>}
    </SheetContent></Dialog>
    <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${config.singular}?`} description={`“${selected?.title ?? "This record"}” will be removed. This cannot be undone.`} confirmLabel="Delete" destructive loading={removing} onConfirm={() => { if (selected) remove(selected.id); }} />
  </>;
}
