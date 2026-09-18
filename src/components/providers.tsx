"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Tooltip } from "radix-ui";
import { ServiceWorker } from "@/components/pwa/service-worker";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Tooltip.Provider delayDuration={250} skipDelayDuration={400}>
        {children}
      </Tooltip.Provider>
      <Toaster
        position="top-center"
        richColors={false}
        closeButton
        toastOptions={{
          classNames: {
            toast:
              "!bg-surface !text-ink !border !border-line !shadow-overlay !rounded-xl !font-sans !text-[13px]",
            description: "!text-ink-2",
            actionButton: "!bg-primary !text-primary-fg",
            closeButton: "!bg-surface !border-line !text-ink-2",
            success: "[&_[data-icon]]:!text-good-ink",
            error: "[&_[data-icon]]:!text-critical-ink",
            warning: "[&_[data-icon]]:!text-warning-ink",
          },
        }}
      />
      <ServiceWorker />
    </ThemeProvider>
  );
}
