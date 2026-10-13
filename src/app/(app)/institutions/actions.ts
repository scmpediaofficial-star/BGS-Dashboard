"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { recordEvent } from "@/lib/events";
import { ensureSaleCustomer } from "@/lib/paystack-sync";
import { getSettings } from "@/lib/settings";
import { formatMoney, pluralize, truncate } from "@/lib/utils";

/**
 * Institutions pay for their members outside Paystack. Each member is an
 * ordinary paid ticket sale (so the ticket, the Paystack customer code and
 * the money totals all live in the one ledger) that remembers who paid.
 */

const institutionSchema = z.object({ id: f.optionalId, name: f.text(160), short_name: f.optionalText(40), signatory_name: f.optionalText(160), signatory_title: f.optionalText(160), contact_person: f.optionalText(160), email: f.optionalEmail, phone: f.optionalText(60), fee: f.optionalMoney, notes: f.optionalText(2000) });

export async function saveInstitution(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = institutionSchema.parse(input);
    const values = { name: data.name, short_name: data.short_name ?? null, signatory_name: data.signatory_name ?? null, signatory_title: data.signatory_title ?? null, contact_person: data.contact_person ?? null, email: data.email ?? null, phone: data.phone ?? null, fee: data.fee ?? null, notes: data.notes ?? null };
    if (data.id) {
      const before = one(await supabase.from("institutions").select("id, name").eq("id", data.id).single());
      check(await supabase.from("institutions").update(values).eq("id", data.id));
      // The institution's name is what the members' sales and tickets show as organisation.
      if (before.name !== values.name) check(await supabase.from("ticket_sales").update({ organization: values.name }).eq("institution_id", data.id));
      await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "institution.updated", category: "tickets", summary: `updated institution “${truncate(values.name, 80)}”`,
        entity: { type: "institution", id: data.id, label: values.name }, link: `/institutions?item=${data.id}`, importance: "low" });
      revalidatePath("/", "layout"); return { id: data.id };
    }
    const row = one(await supabase.from("institutions").insert({ ...values, created_by: profile.id }).select("id").single());
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "institution.added", category: "tickets", summary: `added institution “${truncate(values.name, 80)}”`,
      entity: { type: "institution", id: row.id, label: values.name }, link: `/institutions?item=${row.id}` });
    revalidatePath("/", "layout"); return { id: row.id };
  });
}

/** Removes the institution only; its members keep their sales and tickets, just no longer tagged. */
export async function deleteInstitution(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const row = one(await supabase.from("institutions").select("name").eq("id", f.id.parse(id)).single());
    check(await supabase.from("institutions").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "institution.deleted", category: "tickets", summary: `removed institution “${truncate(row.name, 80)}”`, link: "/institutions", audience: "managers", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  });
}

export type NewMember = { id: string; code: string | null; customerCode: string | null; amount: number };

const memberSchema = z.object({ institution_id: f.id, buyer_name: f.text(160), buyer_email: f.optionalEmail, buyer_phone: f.optionalText(60), amount: f.optionalMoney });

/**
 * One member, paid by the institution: a paid ticket sale at the institution's
 * fee, its ticket issued by the database, and — when an email is given — the
 * buyer added to Paystack so they get a customer code like everyone who paid online.
 */
export async function addMember(input: Record<string, unknown>): Promise<ActionResult<NewMember>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = memberSchema.parse(input);
    const institution = one(await supabase.from("institutions").select("id, name, fee").eq("id", data.institution_id).single());
    const [settings, type] = await Promise.all([
      getSettings(),
      supabase.from("ticket_types").select("id, currency").eq("is_active", true).eq("is_virtual", false).order("sort_order").limit(1).maybeSingle(),
    ]);
    if (!type.data) throw new ActionError("Add an in-person ticket type under Settings → Tickets & payments first.");
    const amount = data.amount ?? institution.fee ?? settings.tickets.direct_price;
    const sale = one(await supabase.from("ticket_sales").insert({
      ticket_type_id: type.data.id, buyer_name: data.buyer_name, buyer_email: data.buyer_email ?? null, buyer_phone: data.buyer_phone ?? null, organization: institution.name, country: "Ghana",
      quantity: 1, amount, currency: type.data.currency, channel: "corporate", payment_status: "paid", institution_id: institution.id, recorded_by: profile.id,
    }).select("id").single());
    const [customerCode, ticket] = await Promise.all([
      ensureSaleCustomer(sale.id),
      supabase.from("tickets").select("code").eq("sale_id", sale.id).neq("status", "void").order("seq").limit(1).maybeSingle(),
    ]);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.recorded", category: "tickets",
      summary: `recorded a ticket for “${truncate(data.buyer_name, 80)}” paid by ${truncate(institution.name, 60)}`, entity: { type: "ticket_sale", id: sale.id, label: data.buyer_name },
      link: `/institutions?item=${institution.id}`, importance: "low",
      facts: [{ label: "Amount", value: formatMoney(amount, type.data.currency) }, ...(ticket.data?.code ? [{ label: "Ticket no.", value: ticket.data.code }] : []), ...(customerCode ? [{ label: "Paystack customer", value: customerCode }] : [])] });
    revalidatePath("/", "layout");
    return { id: sale.id, code: ticket.data?.code ?? null, customerCode, amount };
  });
}

/** Tags sales that were paid outside Paystack to the institution that paid for them. */
export async function assignMembers(input: { institution_id: string; sale_ids: string[] }): Promise<ActionResult<{ count: number }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = z.object({ institution_id: f.id, sale_ids: z.array(f.id).min(1).max(500) }).parse(input);
    const institution = one(await supabase.from("institutions").select("id, name").eq("id", data.institution_id).single());
    const rows = check(await supabase.from("ticket_sales").update({ institution_id: institution.id, organization: institution.name }).in("id", data.sale_ids).is("paystack_id", null).select("id")) ?? [];
    if (!rows.length) throw new ActionError("None of those sales could be tagged. Sales that came through Paystack cannot belong to an institution.");
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "institution.members_assigned", category: "tickets",
      summary: `tagged ${pluralize(rows.length, "member")} to “${truncate(institution.name, 80)}”`, entity: { type: "institution", id: institution.id, label: institution.name }, link: `/institutions?item=${institution.id}`, importance: "low" });
    revalidatePath("/", "layout"); return { count: rows.length };
  });
}

/** Untags a member. The sale and its ticket stay as they are. */
export async function removeMember(saleId: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const sale = one(await supabase.from("ticket_sales").select("id, buyer_name, institution:institutions(name)").eq("id", f.id.parse(saleId)).single());
    check(await supabase.from("ticket_sales").update({ institution_id: null }).eq("id", sale.id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "institution.member_removed", category: "tickets",
      summary: `untagged “${truncate(sale.buyer_name, 80)}” from ${sale.institution?.name ?? "an institution"}`, link: "/institutions", importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  });
}

/** Sets (or clears) the logo printed on this institution's members' certificates. `url` comes from an upload to the public assets bucket. */
export async function setInstitutionLogo(input: { id: string; url: string | null }): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = z.object({ id: f.id, url: z.string().trim().url().max(1000).refine((u) => u.startsWith("https://") || u.startsWith("http://"), "That isn't a web address.").nullable() }).parse(input);
    const row = one(await supabase.from("institutions").select("id, name").eq("id", data.id).single());
    check(await supabase.from("institutions").update({ logo_url: data.url }).eq("id", row.id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "institution.logo_changed", category: "tickets", summary: `${data.url ? "set" : "removed"} the logo of “${truncate(row.name, 80)}”`,
      entity: { type: "institution", id: row.id, label: row.name }, link: `/institutions?item=${row.id}`, importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  });
}

/** Sets (or clears) the image of the signature that goes above the institution's signatory on its members' certificates. */
export async function setInstitutionSignature(input: { id: string; url: string | null }): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = z.object({ id: f.id, url: z.string().trim().url().max(1000).refine((u) => u.startsWith("https://") || u.startsWith("http://"), "That isn't a web address.").nullable() }).parse(input);
    const row = one(await supabase.from("institutions").select("id, name").eq("id", data.id).single());
    check(await supabase.from("institutions").update({ signatory_signature_url: data.url }).eq("id", row.id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "institution.signature_changed", category: "tickets", summary: `${data.url ? "set" : "removed"} the certificate signature for “${truncate(row.name, 80)}”`,
      entity: { type: "institution", id: row.id, label: row.name }, link: `/institutions?item=${row.id}`, importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  });
}
