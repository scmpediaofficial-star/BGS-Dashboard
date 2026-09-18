import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicEnv, serverEnv } from "@/lib/env";

let admin: ReturnType<typeof createSupabaseClient<Database>> | undefined;

/**
 * Service-role client. BYPASSES row-level security — only call it after the
 * caller's permissions have been checked, and never return raw rows from
 * service-only tables (social secrets, app credentials) to the browser.
 */
export function createAdminClient() {
  const key = serverEnv().supabaseServiceKey;
  if (!publicEnv.supabaseUrl || !key) {
    throw new Error("Supabase service credentials are missing. Set SUPABASE_SERVICE_ROLE_KEY.");
  }
  admin ??= createSupabaseClient<Database>(publicEnv.supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin;
}
