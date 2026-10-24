import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account paused" };

export default function PausedPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  // Not requireUser(): it sends paused accounts here.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.paused) redirect("/");
  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Your account is paused.</h1>
      <p className="mt-3 text-ink-soft">Your parent paused your Writt account. Ask them if you’d like it turned back on.</p>
      <form action={signOutAction} className="mt-8">
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </>
  );
}
