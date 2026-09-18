/**
 * Environment access in one place.
 *
 * Several names are accepted for the Supabase keys so that the Vercel ⇄ Supabase
 * integration (which injects its own variable names) works without any renaming.
 */

function first(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => typeof v === "string" && v.trim().length > 0)?.trim();
}

export const publicEnv = {
  supabaseUrl: first(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "",
  supabaseAnonKey:
    first(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? "",
  vapidPublicKey: first(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) ?? "",
};

export const isSupabaseConfigured = Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);

/** Server-only values. Never import this object into a Client Component. */
export function serverEnv() {
  return {
    supabaseServiceKey: first(process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY) ?? "",
    encryptionKey: first(process.env.ENCRYPTION_KEY) ?? "",
    cronSecret: first(process.env.CRON_SECRET) ?? "",
    setupSecret: first(process.env.SETUP_SECRET) ?? "",
    resendApiKey: first(process.env.RESEND_API_KEY) ?? "",
    emailFrom: first(process.env.EMAIL_FROM) ?? "BGS Dashboard <onboarding@resend.dev>",
    emailReplyTo: first(process.env.EMAIL_REPLY_TO),
    vapidPrivateKey: first(process.env.VAPID_PRIVATE_KEY) ?? "",
    vapidSubject: first(process.env.VAPID_SUBJECT) ?? "mailto:info@boardroomgovsummit.com",
  };
}

/** Absolute origin of this deployment, without a trailing slash. */
export function siteUrl(): string {
  const explicit = first(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = first(process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL);
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
