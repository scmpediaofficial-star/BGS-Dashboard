"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISSED_KEY = "bgs:install-dismissed";
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 14;

/**
 * "Install the app" card. Chromium browsers hand us a real install prompt;
 * iOS Safari has no API, so there we show the two taps instead.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
      if (dismissedAt && Date.now() - dismissedAt < SNOOZE_MS) return;
    } catch {
      // storage unavailable (private mode): fall through and show the card
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    let timer: number | undefined;
    if (isIos && isSafari) {
      timer = window.setTimeout(() => { setIosHint(true); setVisible(true); }, 4000);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") setVisible(false);
    else dismiss();
    setEvent(null);
  }

  if (!visible) return null;

  return (
    <aside
      aria-label="Install the BGS Dashboard app"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+74px)] z-40 mx-auto flex max-w-md animate-rise items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-overlay lg:inset-x-auto lg:bottom-6 lg:right-6 lg:mx-0"
    >
      <Image src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink">Install BGS Dashboard</p>
        {iosHint ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">
            Tap <Share className="inline size-3.5 text-accent" aria-label="Share" /> then <SquarePlus className="inline size-3.5 text-accent" aria-hidden /> <strong className="font-semibold text-ink-2">Add to Home Screen</strong>
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-ink-3">Full-screen, faster, with push alerts — like a native app.</p>
        )}
      </div>
      {!iosHint && <Button size="sm" onClick={install}>Install</Button>}
      <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Not now"><X /></Button>
    </aside>
  );
}
