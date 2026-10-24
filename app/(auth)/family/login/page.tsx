import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FamilyLoginForm } from "@/components/family/ConsentForms";

export const metadata: Metadata = { title: "Family sign-in" };

export default function FamilyLoginPage(props: PageProps<"/family/login">) {
  return (
    <>
      <p className="text-sm font-bold tracking-widest text-accent uppercase">For parents</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Family sign-in</h1>
      <p className="mt-2 mb-8 text-ink-soft">Family accounts don’t have a password. Enter your email and we’ll send you a link to sign in.</p>
      <Suspense fallback={null}>
        <Form searchParams={props.searchParams} />
      </Suspense>
      <p className="mt-8 text-sm text-ink-soft">
        Use Writt to write too?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Log in with your password
        </Link>
        .
      </p>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/family/login">["searchParams"] }) {
  const sp = await searchParams;
  return (
    <>
      {sp.expired && (
        <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          That sign-in link has expired or was already used. Ask for a new one below.
        </p>
      )}
      <FamilyLoginForm next={typeof sp.next === "string" ? sp.next : "/family"} />
    </>
  );
}
