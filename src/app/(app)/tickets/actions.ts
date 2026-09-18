"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { accessCode } from "@/lib/crypto";
import { PAYMENT_STATUS } from "@/lib/domain";
import { virtualAccessEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/env";
import { recordEvent } from "@/lib/events";
import { getBrand, getSettings, saveSetting } from "@/lib/settings";
import { formatDate, formatMoney, truncate } from "@/lib/utils";

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
    if (id) { one(await supabase.from("ticket_sales").select("id").eq("id", id).single()); check(await supabase.from("ticket_sales").update(values).eq("id", id)); }
    else id = one(await supabase.from("ticket_sales").insert({ ...values, recorded_by: profile.id }).select("id").single()).id;
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "ticket.updated" : "ticket.recorded", category: "tickets",
      summary: `${data.id ? "updated" : "recorded"} ${data.quantity} ticket${data.quantity === 1 ? "" : "s"} for “${truncate(data.buyer_name, 80)}”`,
      entity: { type: "ticket_sale", id, label: data.buyer_name }, link: `/tickets?item=${id}`, importance: data.quantity >= 10 ? "high" : "normal",
      facts: [{ label: "Amount", value: formatMoney(data.amount, data.currency) }, { label: "Payment", value: PAYMENT_STATUS[data.payment_status].label }] });
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
