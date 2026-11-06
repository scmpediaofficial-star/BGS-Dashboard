import type { Metadata } from "next";
import { StudentTicketForm } from "@/components/auth/student-ticket-form";

export const metadata: Metadata = { title: "Student ticket" };

export default async function StudentTicketPage({ searchParams }: PageProps<"/student-ticket">) {
  const params = await searchParams;
  return <StudentTicketForm initialCode={typeof params.code === "string" ? params.code.slice(0, 40) : ""} />;
}
