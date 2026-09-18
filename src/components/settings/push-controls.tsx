"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { removePushSubscription, savePushSubscription } from "@/app/(app)/settings/actions";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

export function PushControls() {
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const configured = Boolean(publicEnv.vapidPublicKey);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [save] = useAction(savePushSubscription);
  const [remove] = useAction(removePushSubscription);
  useEffect(() => {
    if (!supported || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setSubscribed(Boolean(subscription))).catch(() => setSubscribed(false));
  }, [supported]);
  async function enable() {
    setWorking(true);
    try {
      if (await Notification.requestPermission() !== "granted") { toast.error("Browser notifications were not allowed."); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicEnv.vapidPublicKey) });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Incomplete browser subscription");
      const result = await save({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent });
      if (!result.ok) await subscription.unsubscribe();
      setSubscribed(result.ok);
    } catch (error) { console.error(error); toast.error("Push alerts could not be enabled on this device."); }
    finally { setWorking(false); }
  }
  async function disable() {
    setWorking(true);
    try {
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (subscription) { const result = await remove(subscription.endpoint); if (!result.ok) return; await subscription.unsubscribe(); }
      setSubscribed(false);
    } catch (error) { console.error(error); toast.error("Push alerts could not be disabled on this device."); }
    finally { setWorking(false); }
  }
  return <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4"><div className="flex items-start gap-3"><BellRing className="mt-0.5 size-4 text-accent-ink" aria-hidden /><div><p className="text-xs font-bold text-ink">Push alerts on this device</p><p className="mt-1 text-xs text-ink-3">{process.env.NODE_ENV !== "production" ? "Available in the installed production app." : !configured ? "VAPID keys are not configured." : !supported ? "This browser does not support web push." : subscribed ? "Enabled for this device." : "Get immediate alerts even when the app is closed."}</p></div></div>{process.env.NODE_ENV === "production" && configured && supported && <Button size="sm" variant="outline" loading={working || subscribed === null} onClick={subscribed ? disable : enable}>{subscribed ? "Disable" : "Enable"}</Button>}</div>;
}
