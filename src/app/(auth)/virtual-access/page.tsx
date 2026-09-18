import type { Metadata } from "next";
import { VirtualAccessForm } from "@/components/auth/virtual-access-form";

export const metadata: Metadata = { title: "Virtual access" };

export default function VirtualAccessPage() { return <VirtualAccessForm />; }
