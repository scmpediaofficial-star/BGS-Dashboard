import { cronSecret, safeEqual } from "@/lib/crypto";
import { dispatchDuePosts, tendAccountsHourly } from "@/lib/social/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Publishes due posts and resumes ones still processing on a network.
 * Called every minute by Supabase pg_cron (POST) — or by Vercel Cron (GET) on
 * plans that allow it. Both must present the shared secret.
 */
async function handle(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(token, cronSecret())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await dispatchDuePosts();
    await tendAccountsHourly();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[dispatch]", error);
    return Response.json({ ok: false, error: "Dispatch failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
