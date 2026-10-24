import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LinkButton } from "@/components/ui/Button";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Under maintenance" };

export default function MaintenancePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Logo />
      <Suspense fallback={null}>
        <Status />
      </Suspense>
    </main>
  );
}

async function Status() {
  const { maintenance } = await getSiteSettings();
  if (!maintenance) {
    return (
      <>
        <h1 className="mt-10 font-display text-3xl font-semibold">Writt is back</h1>
        <LinkButton href="/" className="mt-6">
          Go to Writt
        </LinkButton>
      </>
    );
  }
  return (
    <>
      <p className="mt-10 font-display text-6xl text-accent" aria-hidden>
        ✦
      </p>
      <h1 className="mt-4 font-display text-3xl font-semibold">Writt is under maintenance</h1>
      <p className="mt-3 max-w-md text-ink-soft">We’re making some improvements. Please check back soon. Your stories are safe.</p>
    </>
  );
}
