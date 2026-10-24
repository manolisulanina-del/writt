import type { Metadata } from "next";
import Link from "next/link";
import { EmailResetForm } from "@/components/auth/PasswordResetForms";
import { RecoveryForm } from "@/components/auth/RecoveryForm";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-2 mb-8 text-ink-soft">We’ll email you a link to choose a new password.</p>
      <EmailResetForm />
      <details className="mt-8 rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">Use my security question instead</summary>
        <div className="mt-4">
          <RecoveryForm />
        </div>
      </details>
      <p className="mt-8 text-center text-sm text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
