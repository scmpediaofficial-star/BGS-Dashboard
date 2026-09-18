import type { Metadata } from "next";
import Image from "next/image";
import { WifiOff } from "lucide-react";
import { ReloadButton } from "@/components/pwa/reload-button";

export const metadata: Metadata = { title: "Offline" };

/** Precached by the service worker and shown when a page was never visited online. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-navy px-6 text-center text-white">
      <div className="max-w-sm">
        <Image src="/brand/logo-white.png" alt="BGS — The Boardroom Governance Summit" width={720} height={207} className="mx-auto h-auto w-52" />
        <div className="mx-auto mt-6 h-1 w-28 rounded-full flag-stripe" />
        <span className="mx-auto mt-10 grid size-14 place-items-center rounded-2xl bg-white/10"><WifiOff className="size-6 text-gold" aria-hidden /></span>
        <h1 className="mt-5 text-2xl font-extrabold">You&apos;re offline</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/75">
          This page hasn&apos;t been opened on this device before, so there&apos;s no saved copy. Pages you&apos;ve already visited still open — and everything syncs once you&apos;re back online.
        </p>
        <ReloadButton />
      </div>
    </main>
  );
}
