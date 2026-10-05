import { revalidatePath } from "next/cache";
import { isValidWebhook } from "@/lib/paystack";
import { syncPaystackSales } from "@/lib/paystack-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Events that change what the ticket ledger should say. */
const RELEVANT = new Set(["charge.success", "refund.processed", "refund.pending", "refund.processing", "charge.dispute.resolve"]);

/**
 * Paystack → dashboard. Set this route as the webhook URL in Paystack
 * (Settings → API Keys & Webhooks). The payload is only a prompt: once the
 * signature checks out we re-read the truth from Paystack's API, so a forged
 * or replayed body can never invent a payment.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (!isValidWebhook(body, request.headers.get("x-paystack-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event = "";
  try {
    event = String((JSON.parse(body) as { event?: unknown }).event ?? "");
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!RELEVANT.has(event)) return Response.json({ ok: true, ignored: event });

  try {
    const result = await syncPaystackSales();
    if (result.imported || result.linked || result.refunded || result.customers) revalidatePath("/", "layout");
    return Response.json({ ok: true, ...result });
  } catch (error) {
    // A 5xx makes Paystack retry later, which is what we want.
    console.error("[paystack webhook]", error);
    return Response.json({ ok: false, error: "Sync failed" }, { status: 500 });
  }
}
