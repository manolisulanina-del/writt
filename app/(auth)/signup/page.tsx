import type { Metadata } from "next";
import Link from "next/link";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Start writing</h1>
      <p className="mt-2 mb-8 text-ink-soft">Create your Writt account. You’ll pick a username next.</p>
      <div className="space-y-5">
        <OAuthButtons />
        <SignupForm />
      </div>
      <p className="mt-8 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
