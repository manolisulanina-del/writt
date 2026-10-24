import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { Skeleton } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { needsConsent } from "@/lib/kids";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage() {
  return (
    <>
      <p className="text-sm font-semibold tracking-widest text-accent uppercase">Step 1 of 2</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Make it yours</h1>
      <p className="mt-2 mb-8 text-ink-soft">Choose how you’ll appear on Writt. You can change this later.</p>
      <Suspense fallback={<Skeleton className="h-[28rem]" />}>
        <OnboardingBody />
      </Suspense>
    </>
  );
}

async function OnboardingBody() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.needsSetup) redirect("/");

  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const suggestion = (user.name ?? user.email?.split("@")[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 20);

  return (
    <OnboardingForm
      needsPassword={!passwordHash}
      needsBirthDate={!user.birthDate}
      isKid={Boolean(user.birthDate && needsConsent(user.birthDate))}
      email={user.email ?? ""} suggestedUsername={suggestion} />
  );
}
