import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_EVENT, DEFAULT_TARGETS, type EventSettings, type Targets } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { formatDate } from "@/lib/utils";
import type { Brand } from "@/lib/email/templates";
import type { Json } from "@/types/database";

export type EmailVolume = "all" | "important";
export type QueueSettings = { timezone: string; slots: string[]; days: number[] };
export type VirtualSettings = { join_url: string | null; meeting_id: string | null };

export type AppSettings = {
  event: EventSettings;
  targets: Targets;
  organizations: string[];
  sponsor_packages: string[];
  social_queue: QueueSettings;
  email: { volume: EmailVolume };
  virtual: VirtualSettings;
  scheduler: { enabled: boolean; app_url: string | null; configured_at: string | null };
};

const DEFAULTS: AppSettings = {
  event: DEFAULT_EVENT,
  targets: DEFAULT_TARGETS,
  organizations: ["PanAvest", "GMA", "NVAME"],
  sponsor_packages: ["Diamond", "Platinum", "Gold", "Silver", "Bronze", "Partner"],
  social_queue: { timezone: "Africa/Accra", slots: ["08:30", "12:30", "17:30"], days: [0, 1, 2, 3, 4, 5, 6] },
  email: { volume: "all" },
  virtual: { join_url: null, meeting_id: null },
  scheduler: { enabled: false, app_url: null, configured_at: null },
};

/**
 * Workspace settings, merged over defaults (memoised per request). Read with the
 * service role so background jobs — which have no user session — can use it too.
 */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const { data } = await createAdminClient().from("app_settings").select("key, value");
  const stored = Object.fromEntries((data ?? []).map((row) => [row.key, row.value])) as Record<string, unknown>;
  const merged = { ...DEFAULTS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS) as (keyof AppSettings)[]) {
    const value = stored[key];
    if (value === undefined || value === null) continue;
    merged[key] = Array.isArray(DEFAULTS[key]) || typeof DEFAULTS[key] !== "object"
      ? value
      : { ...(DEFAULTS[key] as object), ...(value as object) };
  }
  return merged as AppSettings;
});

export async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K], userId: string | null) {
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key, value: value as unknown as Json, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function getBrand(): Promise<Brand> {
  const { event } = await getSettings();
  return {
    siteUrl: siteUrl(),
    eventName: event.name,
    eventLine: `${formatDate(event.starts_at)} · ${event.venue}, ${event.city}`,
    tagline: event.tagline,
  };
}
