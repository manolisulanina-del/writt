import type { Metadata } from "next";
import Link from "next/link";
import { ConsentCodeForm } from "@/components/family/ConsentForms";

export const metadata: Metadata = { title: "Enter your code", robots: { index: false } };

/** For parents who got a text: enter the child's username and the 6-digit code. */
export default function ApproveCodePage() {
  return (
    <>
      <p className="text-sm font-bold tracking-widest text-accent uppercase">For parents</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Enter your code</h1>
      <p className="mt-2 mb-8 text-ink-soft">Use the username and the 6-digit code from the text Writt sent you.</p>
      <ConsentCodeForm />
      <p className="mt-8 text-sm">
        <Link href="/parents" className="font-semibold text-accent hover:underline">
          Questions? Read our page for parents
        </Link>
      </p>
    </>
  );
}
