"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkForPayments } from "@/app/(app)/payments/actions";

/**
 * While this screen is open and visible, asks the server once a minute to bring
 * in new Paystack payments, and refreshes when something arrived — so a ticket
 * appears on its own shortly after someone pays. The server keeps all open
 * screens to about one Paystack request a minute between them. Pass 0 to switch it off.
 */
export function useAutoImport(everyMs = 60_000) {
  const router = useRouter();

  useEffect(() => {
    if (!everyMs) return; // switched off in Settings
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const result = await checkForPayments();
        if (!stopped && result.ok && result.data.changed) router.refresh();
      } catch {
        // Offline or mid-deploy: the next tick tries again.
      }
    };
    const timer = window.setInterval(check, everyMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [everyMs, router]);
}
