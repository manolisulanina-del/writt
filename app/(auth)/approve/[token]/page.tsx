import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { ConsentDecisionForm, FamilyAccountForm } from "@/components/family/ConsentForms";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/EmptyState";
import { canActAsParent, findConsentRequest } from "@/lib/consent";
import { AGREEMENT, DATA_WE_COLLECT, PROTECTIONS, WHY_WE_COLLECT } from "@/lib/consent-text";
import { GROUP_INFO } from "@/lib/kids";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Approve your child’s account", robots: { index: false } };

export default function ApprovePage(props: PageProps<"/approve/[token]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem]" />}>
      <Body params={props.params} />
    </Suspense>
  );
}

async function Body({ params }: { params: PageProps<"/approve/[token]">["params"] }) {
  const { token } = await params;
  const [request, viewer] = await Promise.all([findConsentRequest(token), getCurrentUser()]);

  if (!request) {
    return (
      <>
        <h1 className="font-display text-4xl font-semibold tracking-tight">This link has expired</h1>
        <p className="mt-3 text-ink-soft">
          It was already used, a newer message was sent, or the 7 days to approve have passed. If your child still wants an account, they can press
          Resend on their sign-up page.
        </p>
        <p className="mt-6 text-sm">
          Got a text with a code instead?{" "}
          <Link href="/approve" className="font-semibold text-accent hover:underline">
            Enter the code
          </Link>
          {" · "}
          <Link href="/parents" className="font-semibold text-accent hover:underline">
            Questions for parents
          </Link>
        </p>
      </>
    );
  }

  const { username } = request.child;
  const group = GROUP_INFO[request.group];
  return (
    <>
      <p className="text-sm font-bold tracking-widest text-accent uppercase">For parents</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Approve @{username}’s account</h1>
      <p className="mt-3 text-ink-soft">
        Your child, <strong className="text-ink">@{username}</strong>, wants to join Writt, a fanfiction website where people write stories and post
        them for others to read.
      </p>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">
          Protections for ages {group.ages}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {PROTECTIONS[request.group].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-soft">You can change these, pause the account or delete it at any time in your free family account.</p>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">What Writt collects about your child, and why</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {DATA_WE_COLLECT.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-soft">{WHY_WE_COLLECT}</p>
      </section>

      <div className="mt-8">
        {viewer && (viewer.id === request.childId || !canActAsParent(viewer)) ? (
          <div className="rounded-xl bg-muted p-4 text-sm">
            <p>
              You’re signed in as <strong>@{viewer.username}</strong>, which can’t approve accounts. Only a parent or guardian aged 18 or over can. Sign
              out, then open this link again.
            </p>
            <form action={signOutAction} className="mt-3">
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        ) : viewer ? (
          <>
            <p className="mb-4 text-sm text-ink-soft">
              {viewer.kind === "FAMILY" ? (
                "You’re approving with your family account."
              ) : (
                <>
                  You’re approving as <strong className="text-ink">@{viewer.username}</strong>. Your account will also become a family account, with a
                  dashboard for @{username}.
                </>
              )}
            </p>
            <ConsentDecisionForm token={token} username={username} agreement={AGREEMENT} />
          </>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="mb-1 font-semibold">Create your free family account</h2>
              <p className="mb-4 text-sm text-ink-soft">You’ll be able to see what @{username} writes and change their settings.</p>
              <FamilyAccountForm token={token} defaultEmail={request.method === "EMAIL" ? request.contact : ""} />
            </div>
            <p className="text-sm text-ink-soft">
              Already on Writt?{" "}
              <Link href={`/login?callbackUrl=${encodeURIComponent(`/approve/${token}`)}`} className="font-semibold text-accent hover:underline">
                Log in to your account
              </Link>{" "}
              or{" "}
              <Link href={`/family/login?next=${encodeURIComponent(`/approve/${token}`)}`} className="font-semibold text-accent hover:underline">
                sign in to your family account
              </Link>
              .
            </p>
          </div>
        )}
      </div>
      <p className="mt-8 text-sm">
        <Link href="/parents" className="font-semibold text-accent hover:underline">
          Questions? Read our page for parents
        </Link>
      </p>
    </>
  );
}
