import type { Metadata } from "next";
import { ForgotForm, Heading } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <Heading title="Reset your password" subtitle="Enter the email you sign in with and we'll send you a secure link." />
      <ForgotForm />
    </>
  );
}
