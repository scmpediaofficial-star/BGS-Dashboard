import "server-only";

import webpush from "web-push";
import { publicEnv, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const env = serverEnv();
  if (!publicEnv.vapidPublicKey || !env.vapidPrivateKey) return (configured = false);
  try {
    webpush.setVapidDetails(env.vapidSubject, publicEnv.vapidPublicKey, env.vapidPrivateKey);
    return (configured = true);
  } catch (err) {
    console.error("[push] invalid VAPID configuration", err);
    return (configured = false);
  }
}

export const isPushConfigured = () => configure();

/** Web Push to every device the given people have enabled. Expired subscriptions are pruned. Never throws. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!userIds.length || !configure()) return 0;
  const db = createAdminClient();
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds);
  if (!subs?.length) return 0;

  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 60 * 60 * 12, urgency: "normal" });
        delivered += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.id);
        else console.error("[push] delivery failed", status ?? err);
      }
    }),
  );

  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  return delivered;
}
