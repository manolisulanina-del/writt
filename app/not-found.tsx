import { Logo } from "@/components/Logo";
import { LinkButton } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Logo />
      <p className="mt-10 font-display text-8xl font-semibold text-accent">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">This page is missing from the manuscript</h1>
      <p className="mt-2 max-w-md text-ink-soft">
        The story may have been deleted, made private, or never existed.
      </p>
      <LinkButton href="/" className="mt-8" size="lg">
        Back to the homepage
      </LinkButton>
    </main>
  );
}
