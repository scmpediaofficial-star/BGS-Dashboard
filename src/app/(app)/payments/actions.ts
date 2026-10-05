"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, f, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { recordEvent } from "@/lib/events";
import { createCustomer, createPaymentLink, createRefund, getPayment, setCustomerRisk, updateCustomer } from "@/lib/paystack";
import { syncPaystackSales, type SyncResult } from "@/lib/paystack-sync";
import { formatMoney, truncate } from "@/lib/utils";

// Paystack is reached with the secret key, not through row-level security, so
// the capability check at the top of each action is the only gate. Keep it first.

const customerCode = z.string().trim().regex(/^CUS_[a-z0-9]+$/i, "That is not a Paystack customer code.");
const phone = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(30, "Keep the phone number under 30 characters.").regex(/^\+?[\d\s()-]{7,}$/, "Enter a phone number with digits only, e.g. +233 24 123 4567.").nullable().optional());

/** Pulls every successful Paystack payment into the ticket ledger and issues the tickets. */
export async function syncPayments(): Promise<ActionResult<SyncResult>> {
  return run(async () => {
    const { profile } = await requireCapability("payments.manage");
    const result = await syncPaystackSales({ id: profile.id, name: profile.full_name });
    revalidatePath("/", "layout");
    return result;
  });
}

export async function saveCustomer(input: Record<string, unknown>): Promise<ActionResult<{ code: string }>> {
  return run(async () => {
    const { profile } = await requireCapability("payments.manage");
    const data = z.object({ code: z.preprocess((v) => (v === "" || v === undefined ? null : v), customerCode.nullable()), email: f.email, first_name: f.text(80), last_name: f.text(80), phone }).parse(input);
    const name = `${data.first_name} ${data.last_name}`;
    const customer = data.code
      ? await updateCustomer(data.code, { first_name: data.first_name, last_name: data.last_name, phone: data.phone })
      : await createCustomer({ email: data.email, first_name: data.first_name, last_name: data.last_name, phone: data.phone });
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.code ? "paystack.customer_updated" : "paystack.customer_created", category: "tickets",
      summary: data.code ? `updated Paystack customer “${truncate(name, 80)}”` : `added “${truncate(name, 80)}” as a Paystack customer`,
      link: `/payments?tab=customers&customer=${customer.code}`, importance: "low", audience: "managers",
      facts: [{ label: "Email", value: customer.email }, { label: "Customer code", value: customer.code }] });
    revalidatePath("/payments");
    return { code: customer.code };
  });
}

export async function setRisk(input: { code: string; risk: string; name: string }): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("payments.manage");
    const data = z.object({ code: customerCode, risk: z.enum(["default", "allow", "deny"]), name: f.text(200) }).parse(input);
    await setCustomerRisk(data.code, data.risk);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "paystack.customer_risk", category: "tickets", audience: "managers",
      summary: data.risk === "deny" ? `blacklisted Paystack customer “${truncate(data.name, 80)}”` : data.risk === "allow" ? `whitelisted Paystack customer “${truncate(data.name, 80)}”` : `removed the Paystack list flag from “${truncate(data.name, 80)}”`,
      link: `/payments?tab=customers&customer=${data.code}`, importance: data.risk === "deny" ? "high" : "normal", tone: data.risk === "deny" ? "warning" : "default" });
    revalidatePath("/payments");
    return undefined;
  });
}

/** A checkout link for one person. Nothing is charged until they pay; once they do, the sync issues their ticket. */
export async function requestPayment(input: { email: string; name: string; amount: number; currency: string }): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const { profile } = await requireCapability("payments.manage");
    const data = z.object({ email: f.email, name: f.text(200), amount: z.coerce.number().positive("Enter an amount above zero.").max(10_000_000), currency: z.enum(["GHS", "USD", "NGN", "ZAR", "KES"]) }).parse(input);
    const link = await createPaymentLink({ email: data.email, amount: data.amount, currency: data.currency, metadata: { full_name: data.name, source: "BGS Dashboard", requested_by: profile.full_name } });
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "paystack.payment_requested", category: "tickets", audience: "managers", importance: "low",
      summary: `created a ${formatMoney(data.amount, data.currency)} payment link for “${truncate(data.name, 80)}”`, link: "/payments", facts: [{ label: "Reference", value: link.reference }] });
    return { url: link.url };
  });
}

export async function refundPayment(input: { paymentId: number; amount?: number | string | null; customerNote?: string; merchantNote?: string }): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("payments.refund");
    const data = z.object({ paymentId: z.coerce.number().int().positive(), amount: f.optionalMoney, customerNote: f.optionalText(300), merchantNote: f.optionalText(300) }).parse(input);
    // Read the payment back from Paystack rather than trusting what the browser says it was.
    const payment = await getPayment(data.paymentId);
    if (payment.status !== "success") throw new ActionError("Only a successful payment can be refunded.");
    if (data.amount && data.amount > payment.amount) throw new ActionError(`The refund can't be more than the ${formatMoney(payment.amount, payment.currency)} that was paid.`);
    const amount = data.amount && data.amount < payment.amount ? data.amount : null;
    await createRefund({ paymentId: payment.id, amount, currency: payment.currency, customerNote: data.customerNote, merchantNote: data.merchantNote ?? `Refunded from the BGS Dashboard by ${profile.full_name}` });
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "paystack.refund_requested", category: "tickets", importance: "high", tone: "critical",
      summary: `refunded ${formatMoney(amount ?? payment.amount, payment.currency)} to “${truncate(payment.customer.name, 80)}” on Paystack`,
      detail: amount ? "A partial refund: the sale and its tickets stay as they are." : "A full refund: once Paystack has processed it, the sale is marked refunded and its tickets are void.",
      link: `/payments?payment=${payment.id}`, facts: [{ label: "Reference", value: payment.reference }, ...(data.merchantNote ? [{ label: "Reason", value: data.merchantNote }] : [])] });
    // Paystack reverses the payment once the refund is processed; pick that up now if it is already done.
    await syncPaystackSales().catch((error) => console.error("[refund] sync after refund failed:", error));
    revalidatePath("/", "layout");
    return undefined;
  }, "Refund sent to Paystack");
}
