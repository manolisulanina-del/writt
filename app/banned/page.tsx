import type { Metadata } from "next";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { isBanned } from "@/auth";
import { Logo } from "@/components/Logo";
import { Button, LinkButton } from "@/components/ui/Button";
import { LocalDateTime } from "@/components/ui/RelativeTime";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account banned" };

export default function BannedPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Logo />
      <Suspense fallback={null}>
        <BanDetails />
      </Suspense>
    </main>
  );
}

async function BanDetails() {
  const user = await getCurrentUser();
  const ban = user
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { bannedUntil: true, banReason: true } })
    : null;

  if (!ban || !isBanned(ban)) {
    return (
      <>
        <h1 className="mt-10 font-display text-3xl font-semibold">You’re not banned</h1>
        <LinkButton href="/" className="mt-6">
          Go to Writt
        </LinkButton>
      </>
    );
  }
  const forever = ban.bannedUntil!.getUTCFullYear() >= 9999;
  return (
    <>
      <h1 className="mt-10 font-display text-3xl font-semibold">Your account is banned</h1>
      <p className="mt-3 max-w-md text-ink-soft">
        {forever ? (
          "This ban doesn’t end."
        ) : (
          <>
            You can use Writt again on <LocalDateTime iso={ban.bannedUntil!.toISOString()} className="font-semibold text-ink" />.
          </>
        )}
      </p>
      {ban.banReason && <p className="mt-3 max-w-md rounded-xl bg-muted px-4 py-3 text-sm">Reason: {ban.banReason}</p>}
      <form action={signOutAction} className="mt-8">
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </>
  );
}
