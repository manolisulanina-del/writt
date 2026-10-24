import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BirthDateForm } from "@/components/auth/BirthDateForm";
import { Skeleton } from "@/components/ui/EmptyState";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your date of birth" };

export default function ConfirmAgePage() {
  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">One more thing</h1>
      <p className="mt-2 mb-8 text-ink-soft">
        Writt now asks everyone for their date of birth, so books are only shown to readers old enough for them.
      </p>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  // Not requireUser(): that would send this page back to itself.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.needsSetup) redirect("/onboarding");
  if (user.birthDate) redirect("/");
  return <BirthDateForm />;
}
