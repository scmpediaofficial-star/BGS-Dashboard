import type { Metadata } from "next";
import { SettingsPageContent } from "./settings-page-content";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab;
  return <SettingsPageContent tab={tab === "targets" || tab === "scheduler" ? tab : "event"} />;
}
