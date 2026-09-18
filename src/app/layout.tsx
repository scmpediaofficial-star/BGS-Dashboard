import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "BGS Dashboard", template: "%s · BGS Dashboard" },
  description: "Planning, production and social command centre for the Boardroom Governance Summit.",
  applicationName: "BGS Dashboard",
  appleWebApp: { capable: true, title: "BGS", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#212162" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b23" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${montserrat.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
