"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/** Registers /sw.js in production and offers a one-tap reload when a new version is waiting. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A stale worker would cache dev bundles: make sure none survives from a production run on this origin.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const promptUpdate = (registration: ServiceWorkerRegistration) => {
      toast("A new version of BGS Dashboard is ready", {
        id: "sw-update",
        duration: Infinity,
        action: { label: "Update", onClick: () => registration.waiting?.postMessage({ type: "SKIP_WAITING" }) },
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) promptUpdate(registration);
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          incoming?.addEventListener("statechange", () => {
            if (incoming.state === "installed" && navigator.serviceWorker.controller) promptUpdate(registration);
          });
        });
        // Long-lived installed apps rarely navigate: check for updates hourly and on refocus.
        const check = () => registration.update().catch(() => {});
        const interval = window.setInterval(check, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
        return () => window.clearInterval(interval);
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
