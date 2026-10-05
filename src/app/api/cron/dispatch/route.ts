import { revalidatePath } from "next/cache";
import { cronSecret, safeEqual } from "@/lib/crypto";
import { isPaystackConfigured } from "@/lib/paystack";
import { syncPaystackSales } from "@/lib/paystack-sync";
import { dispatchDuePosts, tendAccountsHourly } from "@/lib/social/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Publishes due posts and resumes ones still processing on a network.
 * Called every minute by Supabase pg_cron (POST) — or by Vercel Cron (GET) on
 * plans that allow it. Both must present the shared secret.
 *
 * Every fifth minute it also pulls new Paystack payments into the ticket
 * ledger, so sales arrive even if Paystack's webhook is not set up or misses one.
 */
async function handle(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(token, cronSecret())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await dispatchDuePosts();
    await tendAccountsHourly();
    let paystack: Awaited<ReturnType<typeof syncPaystackSales>> | { error: string } | undefined;
    if (isPaystackConfigured() && new Date().getUTCMinutes() % 5 === 0) {
      // Never let a Paystack hiccup fail the publishing run.
      paystack = await syncPaystackSales().catch((error) => {
        console.error("[dispatch] paystack sync failed:", error);
        return { error: "Paystack sync failed" };
      });
      if ("imported" in paystack && (paystack.imported || paystack.linked || paystack.refunded || paystack.customers)) revalidatePath("/", "layout");
    }
    return Response.json({ ok: true, ...result, ...(paystack ? { paystack } : {}) });
  } catch (error) {
    console.error("[dispatch]", error);
    return Response.json({ ok: false, error: "Dispatch failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
