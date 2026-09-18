import "server-only";

import { Resend } from "resend";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Rendered } from "@/lib/email/templates";

export type OutgoingEmail = Rendered & { to: string; template: string };
export type SendResult = { to: string; status: "sent" | "failed" | "skipped"; id?: string; error?: string };

let resend: Resend | null = null;
function client(): Resend | null {
  const key = serverEnv().resendApiKey;
  if (!key) return null;
  resend ??= new Resend(key);
  return resend;
}

export const isEmailConfigured = () => Boolean(serverEnv().resendApiKey);

/**
 * Sends through Resend (batched, up to 100 per request) and records every
 * attempt in `email_log`. Without RESEND_API_KEY nothing leaves the server:
 * messages are logged as "skipped" with their HTML so they can still be
 * previewed under Settings → Email. Never throws — alerting must not break
 * the action that triggered it.
 */
export async function sendEmails(messages: OutgoingEmail[]): Promise<SendResult[]> {
  if (!messages.length) return [];
  const env = serverEnv();
  const api = client();
  const results: SendResult[] = [];

  if (!api) {
    results.push(...messages.map((m) => ({ to: m.to, status: "skipped" as const, error: "RESEND_API_KEY is not set" })));
  } else {
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const { data, error } = await api.batch.send(
          chunk.map((m) => ({
            from: env.emailFrom,
            to: [m.to],
            subject: m.subject,
            html: m.html,
            text: m.text,
            ...(env.emailReplyTo ? { replyTo: env.emailReplyTo } : {}),
            tags: [{ name: "template", value: m.template.replace(/[^a-zA-Z0-9_-]/g, "_") }],
          })),
        );
        if (error) {
          results.push(...chunk.map((m) => ({ to: m.to, status: "failed" as const, error: error.message })));
        } else {
          const ids = ((data as { data?: { id: string }[] } | null)?.data ?? []).map((d) => d.id);
          results.push(...chunk.map((m, n) => ({ to: m.to, status: "sent" as const, id: ids[n] })));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown email error";
        results.push(...chunk.map((m) => ({ to: m.to, status: "failed" as const, error: message })));
      }
    }
  }

  try {
    await createAdminClient().from("email_log").insert(
      messages.map((m, n) => ({
        to_email: m.to,
        subject: m.subject,
        template: m.template,
        status: results[n].status,
        provider_id: results[n].id ?? null,
        error: results[n].error ?? null,
        html: m.html,
      })),
    );
  } catch (err) {
    console.error("[email] could not write email_log", err);
  }

  const failed = results.filter((r) => r.status === "failed");
  if (failed.length) console.error(`[email] ${failed.length} message(s) failed:`, failed[0].error);
  return results;
}

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const [result] = await sendEmails([message]);
  return result;
}
