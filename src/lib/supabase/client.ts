"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client (singleton). Every query is subject to row-level security. */
export function createClient() {
  client ??= createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return client;
}
