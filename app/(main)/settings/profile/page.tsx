import type { Metadata } from "next";
import { Suspense } from "react";
import { EditProfileForm } from "@/components/profile/EditProfileForm";
import { Skeleton } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { getKidState } from "@/lib/family";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Edit profile" };

export default function EditProfilePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 font-display text-4xl font-semibold tracking-tight">Edit profile</h1>
      <Suspense fallback={<Skeleton className="h-[32rem]" />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const user = await requireUser();
  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { username: true, nickname: true, image: true, bio: true, phone: true, securityQuestion: true },
  });
  const kid = await getKidState(user.id);
  return <EditProfileForm profile={profile} isKid={Boolean(kid)} simple={Boolean(kid?.controls.limitedProfile)} />;
}
