import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LoginForm } from "@/components/auth/LoginForm";
import { FormError } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email is already registered with a different sign-in method. Log in the way you did before.",
  AccessDenied: "Sign-in was cancelled or denied.",
  Configuration: "That sign-in option isn’t set up yet. Try another one.",
  Banned: "This account is banned. You can log in again when the ban ends.",
};

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 mb-8 text-ink-soft">Log in to keep reading and writing.</p>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <LoginBody searchParams={props.searchParams} />
      </Suspense>
      <p className="mt-8 text-center text-sm text-ink-soft">
        New to Writt?{" "}
        <Link href="/signup" className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

async function LoginBody({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;
  const error = typeof params.error === "string" ? (ERRORS[params.error] ?? "Sign-in failed. Please try again.") : undefined;
  const reset = params.reset === "1";

  return (
    <div className="space-y-5">
      {reset && (
        <p role="status" className="rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm text-success">
          Password updated. Log in with your new password.
        </p>
      )}
      <FormError message={error} />
      <OAuthButtons callbackUrl={callbackUrl} />
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
