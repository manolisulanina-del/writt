import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { COINS } from "@/lib/coin-rules";
import { DATA_WE_COLLECT, WHY_WE_COLLECT } from "@/lib/consent-text";

export const metadata: Metadata = {
  title: "For parents",
  description: "How Writt keeps kids’ accounts safe: age groups, parent approval and the family dashboard.",
};

/** The two age groups side by side. "Yes" means the protection is on by default. */
const AGE_GROUP_ROWS: [string, string, string][] = [
  ["Books they can see", "Rated Everyone only", "Rated Everyone and Teen"],
  ["Mature books", "Always blocked", "Always blocked"],
  ["Their own books can be rated", "Everyone", "Everyone or Teen"],
  ["Comments", "Off: they can’t post or read them", "On"],
  ["Publishing a book", "You approve each book first", "They publish on their own"],
  ["Profile", "Username, picture and books only", "Can have a bio and show followers"],
  ["Following", "Can’t follow or be followed", "Can follow and be followed"],
  ["Messages", "Only to the creator of Writt", "Only to the creator of Writt"],
  ["Phone number", "Never on their account", "Never on their account"],
  ["Theme shop", "On (Analog Horror unlocks at 12)", "On, every theme"],
];

function Q({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-8">
      <h2 id={id} className="font-display text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-ink-soft [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function ParentsPage(props: PageProps<"/parents">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6">
      <Logo />
      <p className="mt-10 text-sm font-bold tracking-widest text-accent uppercase">For parents and guardians</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Your child and Writt</h1>
      <Suspense fallback={null}>
        <Declined searchParams={props.searchParams} />
      </Suspense>

      <div className="mt-8 space-y-8">
        <Q id="what" title="What is Writt?">
          <p>
            Writt is a fanfiction website: people write stories inspired by books, films, games and their own ideas, and post them for others to read.
            Every book has an age range (Everyone, Teen 13+ or Mature 18+), and readers only see books suitable for their age.
          </p>
        </Q>

        <Q id="why" title="Why did I get a message?">
          <p>
            Writt’s minimum age is 7, and everyone under 16 needs a parent’s permission. When your child signs up, their account stays locked until you
            approve it. If nobody approves within 7 days, the account and everything in it is deleted.
          </p>
          <p>
            Got a text with a code?{" "}
            <Link href="/approve" className="font-semibold text-accent hover:underline">
              Enter it here
            </Link>
            .
          </p>
        </Q>

        <Q id="groups" title="What are the two age groups?">
          <p>
            Kids’ accounts are in one of two groups, based on their date of birth. Each group starts with different protections, and{" "}
            <strong>you can change any of them</strong> in your family dashboard: turn protections off for a younger child, turn them on for an older
            one, or switch an older child to the full set for ages 7 to 12 in one click.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink">
                  <th className="py-2 pr-3 font-semibold" />
                  <th className="py-2 pr-3 font-semibold">Ages 7 to 12</th>
                  <th className="py-2 font-semibold">Ages 13 to 15</th>
                </tr>
              </thead>
              <tbody>
                {AGE_GROUP_ROWS.map(([what, younger, older]) => (
                  <tr key={what} className="border-b border-line/60 align-top last:border-0">
                    <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                      {what}
                    </th>
                    <td className="py-2 pr-3">{younger}</td>
                    <td className="py-2">{older}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            When your child turns 13 they move to the older group. Settings you changed stay as you set them; the rest switch to the defaults for 13 to
            15, and we let you know. At 16, all restrictions end and the link to your family account is removed.
          </p>
        </Q>

        <Q id="data" title="What does Writt collect about my child?">
          <ul className="list-disc space-y-1 pl-5">
            {DATA_WE_COLLECT.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p>{WHY_WE_COLLECT}</p>
        </Q>

        <Q id="dashboard" title="What can I do in the family dashboard?">
          <ul className="list-disc space-y-1 pl-5">
            <li>See their books, drafts and comments, and any reports or removals involving them.</li>
            <li>Approve books before they’re posted (on by default for ages 7 to 12).</li>
            <li>Change their restrictions, turn publishing or the theme shop off, or pause the account.</li>
            <li>See their coins and coin history.</li>
            <li>Download all of their data, remove your permission, or delete the account.</li>
          </ul>
          <p>We also tell you when their book is reported or removed, or when the admin bans, blocks or warns them.</p>
          <p>
            Family accounts have no password: we email you a link to{" "}
            <Link href="/family/login" className="font-semibold text-accent hover:underline">
              sign in
            </Link>
            .
          </p>
        </Q>

        <Q id="coins" title="What are coins?">
          <p>
            Writers earn coins for publishing: {COINS.book} for a new public book and {COINS.chapter} for a new chapter, if it has at least{" "}
            {COINS.minWords} words. Coins buy homepage themes. <strong>They can’t be bought with real money</strong> and can’t be sent to anyone.
          </p>
        </Q>
      </div>
    </main>
  );
}

async function Declined({ searchParams }: { searchParams: PageProps<"/parents">["searchParams"] }) {
  const sp = await searchParams;
  if (!sp.declined) return null;
  return (
    <p role="status" className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium">
      You declined. The account and everything in it was deleted.
    </p>
  );
}
