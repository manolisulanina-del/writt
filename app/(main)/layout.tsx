import { Suspense } from "react";
import { Navbar } from "@/components/nav/Navbar";
import { AnnouncementBanner, SiteFooter, SiteGate, WarningGate } from "@/components/site/SiteChrome";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AnnouncementBanner />
      <Navbar />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <Suspense fallback={null}>
        <SiteGate />
        <WarningGate />
      </Suspense>
    </>
  );
}
