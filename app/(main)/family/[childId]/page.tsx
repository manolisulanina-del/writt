import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountActions, BookApproval, ControlList, RestrictionButtons, type ControlRow } from "@/components/family/FamilyControls";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/EmptyState";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { prisma } from "@/lib/db";
import { COIN_REASON_LABEL } from "@/lib/coins";
import { RATING_LABEL, ageFrom } from "@/lib/content";
import { getKidState, requireChildOf } from "@/lib/family";
import { ACCOUNT_SWITCHES, GROUP_INFO, RESTRICTIONS } from "@/lib/kids";
import { requireParent } from "@/lib/session";
import { REPORT_REASONS } from "@/lib/validation";

export const metadata: Metadata = { title: "Family" };

const REASON = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

export default function ChildPage(props: PageProps<"/family/[childId]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/family" className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Family dashboard
      </Link>
      <Suspense fallback={<Skeleton className="mt-6 h-[40rem]" />}>
        <Body params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

function Section({ id, title, children, hint }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="font-display text-2xl font-semibold">
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

async function Body({ params, searchParams }: { params: PageProps<"/family/[childId]">["params"]; searchParams: PageProps<"/family/[childId]">["searchParams"] }) {
  const [{ childId }, sp, parent] = await Promise.all([params, searchParams, requireParent()]);
  const child = await requireChildOf(parent.id, childId);
  const state = await getKidState(child.id);
  const age = ageFrom(child.birthDate);

  const [books, comments, reports, notices, coins] = await Promise.all([
    prisma.fanfic.findMany({
      where: { authorId: child.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, visibility: true, rating: true, removed: true, removedReason: true, awaitingApproval: true, wordCount: true, updatedAt: true },
    }),
    prisma.comment.findMany({
      where: { authorId: child.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, body: true, createdAt: true, fanfic: { select: { id: true, title: true } } },
    }),
    prisma.report.findMany({
      where: { fanfic: { authorId: child.id } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, reason: true, createdAt: true, fanfic: { select: { id: true, title: true } } },
    }),
    prisma.notification.findMany({
      where: { userId: child.id, kind: { in: ["BOOK_REMOVED", "BANNED", "BLOCKED", "MUTED", "WARNING"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, body: true, createdAt: true },
    }),
    prisma.coinTransaction.findMany({
      where: { userId: child.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, amount: true, reason: true, note: true, createdAt: true },
    }),
  ]);
  const waiting = books.filter((b) => b.awaitingApproval && !b.removed);

  const rows = (list: readonly { key: string; label: string; detail: string }[]): ControlRow[] =>
    state
      ? list.map((r) => ({
          ...r,
          on: state.controls[r.key as keyof typeof state.controls],
          // The parent's own choice: it stays as it is when the child changes age group.
          changed: r.key in state.overrides,
        }))
      : [];

  return (
    <>
      {sp.approved && (
        <p role="status" className="mt-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          Thank you! @{child.username}’s account is approved. These are their settings: change anything you like.
        </p>
      )}
      <header className="mt-6 flex items-center gap-4">
        <Avatar src={child.image} name={child.username} size={72} />
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">@{child.username}</h1>
          <p className="text-ink-soft">
            {age} years old
            {state && ` · ${GROUP_INFO[state.group].label} group, ages ${GROUP_INFO[state.group].ages}`}
            {" · "}
            {child.coins} coins
          </p>
        </div>
      </header>

      <Section id="account" title="Account">
        <AccountActions childId={child.id} username={child.username} paused={child.paused} consent={child.consent} />
        {child.paused && <p className="mt-3 text-sm font-semibold text-ink-soft">Paused: they can log in but only see “Your account is paused.”</p>}
      </Section>

      {state && (
        <>
          <Section
            id="restrictions"
            title="Restrictions"
            hint={
              state.group === "YOUNGER"
                ? "For ages 7 to 12 every restriction starts on. Turn off any you don’t need."
                : "For ages 13 to 15 these start off. Turn on any you’d like, or all of them at once."
            }
          >
            <ControlList childId={child.id} title="Restrictions" rows={rows(RESTRICTIONS)} />
            <div className="mt-3 rounded-xl bg-muted px-4 py-3 text-sm">
              <strong>Always on:</strong> Mature books are blocked for everyone under 16, there’s no phone number on their account, and they can
              only message the creator of Writt.
            </div>
            <div className="mt-3">
              <RestrictionButtons childId={child.id} older={state.group === "OLDER"} />
            </div>
          </Section>
          <Section id="switches" title="Publishing and the theme shop">
            <ControlList childId={child.id} title="Publishing and the theme shop" rows={rows(ACCOUNT_SWITCHES)} />
          </Section>
        </>
      )}

      <Section id="approve" title="Books waiting for your approval">
        {waiting.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing waiting right now.</p>
        ) : (
          <ul className="space-y-3">
            {waiting.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-surface p-4">
                <div>
                  <Link href={`/fanfic/${b.id}`} className="font-semibold hover:text-accent">
                    {b.title}
                  </Link>
                  <p className="text-xs text-ink-soft">
                    {b.wordCount} words{b.rating ? ` · ${RATING_LABEL[b.rating]}` : ""} · read it before approving
                  </p>
                </div>
                <BookApproval childId={child.id} fanficId={b.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="books" title="Books and drafts">
        {books.length === 0 ? (
          <p className="text-sm text-ink-soft">No books yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {books.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <Link href={`/fanfic/${b.id}`} className="font-semibold hover:text-accent">
                  {b.title}
                </Link>
                <span className="text-xs text-ink-soft">
                  {b.removed ? "Removed" : b.awaitingApproval ? "Waiting for you" : b.visibility.toLowerCase()} · {b.wordCount} words · updated{" "}
                  <RelativeTime iso={b.updatedAt.toISOString()} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="comments" title="Their comments">
        {comments.length === 0 ? (
          <p className="text-sm text-ink-soft">No comments.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                <p className="whitespace-pre-wrap">{c.body}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  on{" "}
                  <Link href={`/fanfic/${c.fanfic.id}`} className="font-semibold hover:text-accent">
                    {c.fanfic.title}
                  </Link>{" "}
                  · <RelativeTime iso={c.createdAt.toISOString()} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="reports" title="Reports, removals and admin notices">
        {reports.length === 0 && notices.length === 0 && !books.some((b) => b.removed) ? (
          <p className="text-sm text-ink-soft">Nothing here. That’s good news.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {books
              .filter((b) => b.removed)
              .map((b) => (
                <p key={b.id} className="rounded-xl bg-danger/10 px-4 py-3">
                  <strong>“{b.title}” was removed.</strong> {b.removedReason}
                </p>
              ))}
            {notices.map((n) => (
              <p key={n.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                <strong>{n.title}</strong> {n.body} <RelativeTime iso={n.createdAt.toISOString()} className="text-xs text-ink-soft" />
              </p>
            ))}
            {reports.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {reports.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                    <span>
                      “{r.fanfic.title}” reported: {REASON[r.reason] ?? r.reason}
                    </span>
                    <RelativeTime iso={r.createdAt.toISOString()} className="text-xs text-ink-soft" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section id="coins" title={`Coins: ${child.coins}`} hint="Coins are earned by publishing books and chapters. They can’t be bought, and can only be spent on homepage themes.">
        {coins.length === 0 ? (
          <p className="text-sm text-ink-soft">No coins yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
                <th className="py-2 font-semibold">When</th>
                <th className="py-2 font-semibold">What</th>
                <th className="py-2 text-right font-semibold">Coins</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((t) => (
                <tr key={t.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2">
                    <RelativeTime iso={t.createdAt.toISOString()} />
                  </td>
                  <td className="py-2">
                    {COIN_REASON_LABEL[t.reason]}
                    {t.note ? `: ${t.note}` : ""}
                  </td>
                  <td className={t.amount > 0 ? "py-2 text-right font-semibold text-success tabular-nums" : "py-2 text-right font-semibold text-danger tabular-nums"}>
                    {t.amount > 0 ? `+${t.amount}` : t.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
