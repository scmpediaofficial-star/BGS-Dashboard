"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { accessCode } from "@/lib/crypto";
import { PAYMENT_STATUS, TICKET_KIND, TICKET_STATUS, TICKET_STATUS_ORDER } from "@/lib/domain";
import { virtualAccessEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/env";
import { recordEvent } from "@/lib/events";
import { moderatorName } from "@/lib/attendance";
import { ensureSaleCustomer } from "@/lib/paystack-sync";
import { getBrand, getSettings, saveSetting } from "@/lib/settings";
import { formatDate, formatMoney, pluralize, truncate } from "@/lib/utils";

const payments = ["paid", "pending", "complimentary", "refunded"] as const;
const channels = ["website", "direct", "corporate", "sponsor", "complimentary", "other"] as const;
const saleSchema = z.object({ id: f.optionalId, ticket_type_id: f.id, buyer_name: f.text(160), buyer_email: f.optionalEmail, buyer_phone: f.optionalText(60),
  organization: f.optionalText(160), country: f.text(100), quantity: z.coerce.number().int().min(1).max(10000), amount: z.coerce.number().min(0).max(1_000_000_000),
  currency: z.enum(["GHS", "USD"]).default("GHS"), channel: z.enum(channels), payment_status: z.enum(payments), reference: f.optionalText(160), notes: f.optionalText(3000) });

export async function saveSale(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = saleSchema.parse(input);
    const values = { ticket_type_id: data.ticket_type_id, buyer_name: data.buyer_name, buyer_email: data.buyer_email ?? null, buyer_phone: data.buyer_phone ?? null,
      organization: data.organization ?? null, country: data.country, quantity: data.quantity, amount: data.amount, currency: data.currency, channel: data.channel,
      payment_status: data.payment_status, reference: data.reference ?? null, notes: data.notes ?? null };
    let id = data.id;
    if (id) {
      const before = one(await supabase.from("ticket_sales").select("id, buyer_email, paystack_id").eq("id", id).single());
      // A customer code belongs to an email address: a corrected email on a hand-recorded sale gets a fresh one below.
      const recode = before.paystack_id === null && (before.buyer_email ?? "").toLowerCase() !== (values.buyer_email ?? "").toLowerCase();
      check(await supabase.from("ticket_sales").update({ ...values, ...(recode ? { paystack_customer_code: null } : {}) }).eq("id", id));
    }
    else id = one(await supabase.from("ticket_sales").insert({ ...values, recorded_by: profile.id }).select("id").single()).id;
    // Paid outside Paystack? Add the buyer to Paystack as a customer so they have a customer code too.
    const customerCode = await ensureSaleCustomer(id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "ticket.updated" : "ticket.recorded", category: "tickets",
      summary: `${data.id ? "updated" : "recorded"} ${data.quantity} ticket${data.quantity === 1 ? "" : "s"} for “${truncate(data.buyer_name, 80)}”`,
      entity: { type: "ticket_sale", id, label: data.buyer_name }, link: `/tickets?item=${id}`, importance: data.quantity >= 10 ? "high" : "normal",
      facts: [{ label: "Amount", value: formatMoney(data.amount, data.currency) }, { label: "Payment", value: PAYMENT_STATUS[data.payment_status].label }, ...(customerCode ? [{ label: "Paystack customer", value: customerCode }] : [])] });
    revalidatePath("/", "layout"); return { id };
  });
}

export async function setPaymentStatus(id: string, status: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const input = z.object({ id: f.id, status: z.enum(payments) }).parse({ id, status });
    const before = one(await supabase.from("ticket_sales").select("buyer_name, payment_status").eq("id", input.id).single());
    if (before.payment_status === input.status) return undefined;
    check(await supabase.from("ticket_sales").update({ payment_status: input.status }).eq("id", id));
    if (input.status === "paid") await ensureSaleCustomer(input.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.payment_changed", category: "tickets",
      summary: `marked “${before.buyer_name}” as ${PAYMENT_STATUS[input.status].label}`, entity: { type: "ticket_sale", id, label: before.buyer_name },
      link: `/tickets?item=${id}`, importance: ["paid", "refunded"].includes(input.status) ? "high" : "normal", tone: input.status === "paid" ? "good" : input.status === "refunded" ? "critical" : "default" });
    revalidatePath("/", "layout"); return undefined;
  });
}

export async function deleteSale(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const row = one(await supabase.from("ticket_sales").select("buyer_name").eq("id", f.id.parse(id)).single());
    check(await supabase.from("ticket_sales").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.deleted", category: "tickets", summary: `removed ticket sale for “${row.buyer_name}”`, link: "/tickets", audience: "managers", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  });
}

export async function sendVirtualAccess(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const row = one(await supabase.from("ticket_sales").select("id, buyer_name, buyer_email, payment_status, access_code, ticket_type:ticket_types(name, is_virtual)").eq("id", f.id.parse(id)).single());
    if (!row.ticket_type?.is_virtual) throw new ActionError("Virtual access is available only for virtual tickets.");
    if (row.payment_status !== "paid" && row.payment_status !== "complimentary") throw new ActionError("Record payment before sending virtual access.");
    if (!row.buyer_email) throw new ActionError("Add the buyer's email address first.");
    const code = row.access_code ?? accessCode();
    if (!row.access_code) check(await supabase.from("ticket_sales").update({ access_code: code }).eq("id", id));
    const settings = await getSettings();
    const result = await sendEmail({ to: row.buyer_email, template: "virtual-access", ...virtualAccessEmail({ brand: await getBrand(), attendeeName: row.buyer_name,
      ticketName: row.ticket_type.name, accessCode: code, joinUrl: `${siteUrl()}/virtual-access`, meetingId: settings.virtual.meeting_id,
      supportEmail: settings.event.email, eventStartsLabel: formatDate(settings.event.starts_at) }) });
    if (result.status !== "sent") {
      await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.access_undelivered", category: "tickets",
        summary: `prepared virtual access for ${row.buyer_name} but email was ${result.status}`, entity: { type: "ticket_sale", id, label: row.buyer_name },
        link: `/tickets?item=${id}`, audience: "managers", importance: "high", tone: "warning" });
      revalidatePath("/", "layout");
      throw new ActionError(result.status === "skipped" ? "Email is not configured yet. The access code was saved, but no email was sent." : "The access email failed. Check the email log and try again.");
    }
    check(await supabase.from("ticket_sales").update({ access_sent_at: new Date().toISOString() }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.access_sent", category: "tickets",
      summary: `sent virtual access to ${row.buyer_name}`, entity: { type: "ticket_sale", id, label: row.buyer_name }, link: `/tickets?item=${id}`, importance: "high", tone: "good" });
    revalidatePath("/", "layout"); return undefined;
  }, "Virtual access sent");
}

export async function saveVirtualSettings(input: { join_url: string; meeting_id: string }): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const data = z.object({ join_url: f.optionalUrl, meeting_id: f.optionalText(100) }).parse(input);
    await saveSetting("virtual", { join_url: data.join_url ?? null, meeting_id: data.meeting_id ?? null }, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "tickets.virtual_settings", category: "tickets", summary: "updated virtual access settings", link: "/tickets", audience: "managers", importance: "normal" });
    revalidatePath("/", "layout"); return undefined;
  }, "Virtual access settings saved");
}

// ── Tickets ─────────────────────────────────────────────────────────────────
// Paid tickets are issued and voided by the database as their sale changes
// (see sync_sale_tickets). What people do by hand is below: delegates,
// complimentary tickets, the name on a ticket and its status at the door.

const ticketLabel = (t: { holder_name: string | null; code: string }) => t.holder_name ?? t.code;

const ticketSchema = z.object({ id: f.optionalId, kind: z.enum(["delegate", "complimentary"]).default("delegate"), holder_name: f.optionalText(160), holder_email: f.optionalEmail,
  holder_phone: f.optionalText(60), organization: f.optionalText(160), role_label: f.optionalText(80), notes: f.optionalText(2000) });

/** Adds a delegate (or one named complimentary ticket), or corrects the details printed on any ticket. */
export async function saveTicket(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = ticketSchema.parse(input);
    const values = { holder_name: data.holder_name ?? null, holder_email: data.holder_email ?? null, holder_phone: data.holder_phone ?? null,
      organization: data.organization ?? null, notes: data.notes ?? null };
    if (data.id) {
      const before = one(await supabase.from("tickets").select("id, code, kind, holder_name").eq("id", data.id).single());
      if (before.kind !== "complimentary" && !values.holder_name) throw new ActionError("Enter the name to print on the ticket.");
      check(await supabase.from("tickets").update({ ...values, ...(before.kind === "delegate" ? { role_label: data.role_label ?? null } : {}) }).eq("id", data.id));
      await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.holder_updated", category: "tickets",
        summary: `updated ticket ${before.code}${values.holder_name ? ` for “${truncate(values.holder_name, 80)}”` : ""}`,
        entity: { type: "ticket", id: before.id, label: ticketLabel({ holder_name: values.holder_name, code: before.code }) }, link: `/tickets?tab=tickets&ticket=${before.id}`, importance: "low" });
      revalidatePath("/", "layout"); return { id: before.id };
    }
    if (!values.holder_name) throw new ActionError(data.kind === "delegate" ? "Enter the delegate's name." : "Enter the guest's name, or issue blank complimentary tickets instead.");
    const row = one(await supabase.from("tickets").insert({ ...values, kind: data.kind, role_label: data.kind === "delegate" ? data.role_label ?? null : null, issued_by: profile.id }).select("id, code").single());
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.issued", category: "tickets",
      summary: data.kind === "delegate" ? `added delegate “${truncate(values.holder_name, 80)}”` : `issued a complimentary ticket to “${truncate(values.holder_name, 80)}”`,
      entity: { type: "ticket", id: row.id, label: values.holder_name }, link: `/tickets?tab=tickets&ticket=${row.id}`,
      facts: [{ label: "Ticket no.", value: row.code }, ...(data.kind === "delegate" && data.role_label ? [{ label: "Role", value: data.role_label }] : [])] });
    revalidatePath("/", "layout"); return { id: row.id };
  });
}

/** A batch of blank complimentary tickets: no name, just "Complimentary" and a unique code each. */
export async function issueComplimentary(input: { count: number; notes?: string }): Promise<ActionResult<{ count: number }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = z.object({ count: z.coerce.number().int().min(1, "Issue at least one ticket.").max(1000, "Issue at most 1,000 tickets at a time."), notes: f.optionalText(300) }).parse(input);
    const rows = Array.from({ length: data.count }, () => ({ kind: "complimentary", notes: data.notes ?? null, issued_by: profile.id }));
    for (let i = 0; i < rows.length; i += 500) check(await supabase.from("tickets").insert(rows.slice(i, i + 500)));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.complimentary_issued", category: "tickets",
      summary: `issued ${pluralize(data.count, "complimentary ticket")}`, detail: data.notes ?? undefined, link: "/tickets?tab=tickets&kind=complimentary", importance: data.count >= 10 ? "high" : "normal" });
    revalidatePath("/", "layout"); return { count: data.count };
  });
}

/** Gives every confirmed panel member and every panel moderator a delegate ticket, once. */
export async function addProgrammeDelegates(): Promise<ActionResult<{ count: number }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const [panelists, panels, existing] = await Promise.all([
      supabase.from("panelists").select("id, full_name, organization, email, phone").eq("status", "confirmed").order("sort_order"),
      supabase.from("panels").select("number, moderator").order("number"),
      supabase.from("tickets").select("panelist_id, holder_name").eq("kind", "delegate").neq("status", "void"),
    ]);
    const delegates = check(existing) ?? [];
    const withTicket = new Set(delegates.map((t) => t.panelist_id).filter(Boolean));
    const names = new Set(delegates.map((t) => t.holder_name?.trim().toLowerCase()).filter(Boolean));
    const rows: { kind: string; holder_name: string; holder_email?: string | null; holder_phone?: string | null; organization?: string | null; role_label: string; panelist_id?: string; issued_by: string }[] = [];
    for (const p of check(panelists) ?? []) {
      if (withTicket.has(p.id) || names.has(p.full_name.trim().toLowerCase())) continue;
      rows.push({ kind: "delegate", holder_name: p.full_name.trim(), holder_email: p.email, holder_phone: p.phone, organization: p.organization, role_label: "Panel member", panelist_id: p.id, issued_by: profile.id });
      names.add(p.full_name.trim().toLowerCase());
    }
    for (const panel of check(panels) ?? []) {
      const moderator = moderatorName(panel.moderator);
      if (!moderator || names.has(moderator.toLowerCase())) continue;
      rows.push({ kind: "delegate", holder_name: moderator, role_label: "Moderator", issued_by: profile.id });
      names.add(moderator.toLowerCase());
    }
    if (rows.length) {
      check(await supabase.from("tickets").insert(rows));
      await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.delegates_added", category: "tickets",
        summary: `added ${pluralize(rows.length, "delegate")} from the programme`, detail: truncate(rows.map((r) => r.holder_name).join(", "), 240), link: "/tickets?tab=tickets&kind=delegate" });
      revalidatePath("/", "layout");
    }
    return { count: rows.length };
  });
}

export async function setTicketStatus(id: string, status: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const input = z.object({ id: f.id, status: z.enum(TICKET_STATUS_ORDER) }).parse({ id, status });
    const before = one(await supabase.from("tickets").select("id, code, holder_name, status, kind").eq("id", input.id).single());
    if (before.status === input.status) return undefined;
    check(await supabase.from("tickets").update({ status: input.status }).eq("id", input.id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.status_changed", category: "tickets",
      summary: input.status === "checked_in" ? `checked in “${truncate(ticketLabel(before), 80)}”` : `marked ticket ${before.code} as ${TICKET_STATUS[input.status].label}`,
      entity: { type: "ticket", id: before.id, label: ticketLabel(before) }, link: `/tickets?tab=tickets&ticket=${before.id}`,
      importance: input.status === "void" ? "normal" : "low", tone: input.status === "void" ? "warning" : "default",
      facts: [{ label: "Ticket no.", value: before.code }, { label: "Type", value: TICKET_KIND[before.kind as keyof typeof TICKET_KIND]?.label ?? before.kind }] });
    revalidatePath("/", "layout"); return undefined;
  });
}

/** Removes delegate and complimentary tickets. A paid ticket belongs to its sale: refund or delete the sale instead. */
export async function deleteTickets(ids: string[]): Promise<ActionResult<{ count: number }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const list = z.array(f.id).min(1).max(1000).parse(ids);
    const found: { id: string; code: string; holder_name: string | null; kind: string; sale_id: string | null }[] = [];
    for (let i = 0; i < list.length; i += 200) found.push(...(check(await supabase.from("tickets").select("id, code, holder_name, kind, sale_id").in("id", list.slice(i, i + 200))) ?? []));
    if (!found.length) throw new ActionError("Those tickets no longer exist.");
    if (found.some((t) => t.sale_id)) throw new ActionError("Tickets from a sale can't be deleted here. Refund or delete the sale, or mark the ticket void.");
    for (let i = 0; i < found.length; i += 200) check(await supabase.from("tickets").delete().in("id", found.slice(i, i + 200).map((t) => t.id)));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "ticket.deleted", category: "tickets",
      summary: found.length === 1 ? `deleted ticket ${found[0].code}${found[0].holder_name ? ` (“${truncate(found[0].holder_name, 80)}”)` : ""}` : `deleted ${pluralize(found.length, "ticket")}`,
      link: "/tickets?tab=tickets", audience: "managers", tone: "warning" });
    revalidatePath("/", "layout"); return { count: found.length };
  });
}
