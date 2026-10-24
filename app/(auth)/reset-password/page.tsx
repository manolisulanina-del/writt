import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewPasswordForm } from "@/components/auth/PasswordResetForms";
import { Skeleton } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { peekLoginToken } from "@/lib/login-tokens";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/** Opened from the "Reset your Writt password" email. */
export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Choose a new password</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-64" />}>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const userId = await peekLoginToken(token, "PASSWORD_RESET");
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { username: true, email: true } }) : null;
  if (!user) {
    return (
      <>
        <p className="mt-3 text-ink-soft">This link has expired or was already used. Reset links work once and last 1 hour.</p>
        <p className="mt-6 text-sm">
          <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
            Ask for a new link
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <p className="mt-2 mb-8 text-ink-soft">
        For <strong className="text-ink">@{user.username}</strong>. Pick something you don’t use anywhere else.
      </p>
      <NewPasswordForm token={token} context={[user.username, user.email ?? ""]} />
    </>
  );
}
