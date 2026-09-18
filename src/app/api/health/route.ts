import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Uptime probe. Public on purpose; says nothing beyond "up" or "down". */
export async function GET() {
  let database: "up" | "down" = "down";
  try {
    const { error } = await createAdminClient().from("app_settings").select("key", { count: "exact", head: true });
    if (!error) database = "up";
  } catch {
    // reported as "down"
  }
  return Response.json({ ok: database === "up", time: new Date().toISOString(), database }, { status: database === "up" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
