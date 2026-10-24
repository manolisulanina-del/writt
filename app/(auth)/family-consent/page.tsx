import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { ParentContactForm, ResendButton } from "@/components/family/ConsentForms";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/EmptyState";
import { LocalDateTime } from "@/components/ui/RelativeTime";
import { prisma } from "@/lib/db";
import { mayNeedKidSync, syncKidState } from "@/lib/family";
import { getCurrentUser } from "@/lib/session";
import { smsAvailable } from "@/lib/sms";

export const metadata: Metadata = { title: "Ask a parent" };

export default function FamilyConsentPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72" />}>
      <Body />
    </Suspense>
  );
}

function SignOut() {
  return (
    <form action={signOutAction} className="mt-8 text-center">
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}

async function Body() {
  // Not requireUser(): it sends locked accounts here.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.kind === "FAMILY") redirect("/family");
  if (user.needsSetup) redirect("/onboarding");
  if (!user.birthDate) redirect("/confirm-age");
  const consent = mayNeedKidSync(user) ? await syncKidState(user) : user.consent;
  if (consent !== "PENDING" && consent !== "REVOKED") redirect("/");

  if (consent === "REVOKED") {
    return (
      <>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Your account is locked</h1>
        <p className="mt-3 text-ink-soft">
          Your parent turned off their permission for your Writt account. Ask them to turn it back on in their family dashboard.
        </p>
        <SignOut />
      </>
    );
  }

  const [request, account] = await Promise.all([
    prisma.consentRequest.findUnique({ where: { childId: user.id }, select: { method: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { consentDeadline: true } }),
  ]);
  const deadline = account?.consentDeadline;
  const deadlineNote = deadline && (
    <p className="mt-6 text-sm text-ink-soft">
      If nobody approves by <LocalDateTime iso={deadline.toISOString()} className="font-semibold text-ink" />, this account and everything in it will be
      deleted.
    </p>
  );

  if (!request) {
    return (
      <>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Ask a parent</h1>
        <p className="mt-2 mb-8 text-ink-soft">
          Because you’re under 16, a parent or guardian needs to say yes before you can use Writt. Enter their {smsAvailable() ? "email or phone number" : "email address"} and
          we’ll send them a message about your account.
        </p>
        <ParentContactForm phoneAllowed={smsAvailable()} />
        {deadlineNote}
        <SignOut />
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Waiting for your parent to approve your account.</h1>
      <p className="mt-3 mb-8 text-ink-soft">
        We sent your parent {request.method === "EMAIL" ? "an email" : "a text message"}. Once they approve, you can start using Writt.
      </p>
      <ResendButton />
      <details className="mt-6 rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">{smsAvailable() ? "Use a different email or phone number" : "Use a different email address"}</summary>
        <div className="mt-4">
          <ParentContactForm submitLabel="Send" phoneAllowed={smsAvailable()} />
        </div>
      </details>
      {deadlineNote}
      <SignOut />
    </>
  );
}
