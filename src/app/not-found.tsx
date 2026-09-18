import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
      <div className="max-w-sm">
        <Image src="/brand/logo-color.png" alt="BGS — The Boardroom Governance Summit" width={720} height={211} className="mx-auto h-auto w-48 dark:hidden" />
        <Image src="/brand/logo-white.png" alt="BGS — The Boardroom Governance Summit" width={720} height={207} className="mx-auto hidden h-auto w-48 dark:block" />
        <p className="mt-10 text-6xl font-extrabold text-accent">404</p>
        <h1 className="mt-2 text-xl font-extrabold text-ink">That page isn&apos;t on the agenda</h1>
        <p className="mt-2 text-[13px] text-ink-2">The link may be old, or the record may have been removed.</p>
        <Button asChild className="mt-6"><Link href="/">Back to the overview</Link></Button>
      </div>
    </main>
  );
}
