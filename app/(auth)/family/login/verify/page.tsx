import type { Metadata } from "next";
import { Suspense } from "react";
import { UseLoginLinkButton } from "@/components/family/ConsentForms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** The link from the sign-in email. Signing in takes a button press, so email link scanners can't use the link up. */
export default function VerifyFamilyLoginPage(props: PageProps<"/family/login/verify">) {
  return (
    <>
      <p className="text-sm font-bold tracking-widest text-accent uppercase">For parents</p>
      <h1 className="mt-1 mb-8 font-display text-4xl font-semibold tracking-tight">Sign in to your family account</h1>
      <Suspense fallback={null}>
        <Verify searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Verify({ searchParams }: { searchParams: PageProps<"/family/login/verify">["searchParams"] }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const next = typeof sp.next === "string" ? sp.next : "/family";
  return <UseLoginLinkButton token={token} next={next} />;
}
