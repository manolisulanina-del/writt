import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOutEverywhereAction } from "@/actions/auth";
import { BlockedList, ContentPrefsForm } from "@/components/settings/SettingsForms";
import { Button, LinkButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/EmptyState";
import { ageFrom, ageGroup } from "@/lib/content";
import { prisma } from "@/lib/db";
import { getKidState, type KidState } from "@/lib/family";
import { GROUP_INFO } from "@/lib/kids";
import { requireUser } from "@/lib/session";
import { shopState } from "@/lib/theme-shop";
import { ApplyButton } from "@/components/shop/ShopControls";

function ageGroupText(birthDate: Date | null, kid: KidState | null): string {
  if (kid) {
    const g = GROUP_INFO[kid.group];
    const sees = kid.controls.everyoneOnly ? "Everyone books" : "Everyone and Teen books";
    return `${g.label} group (ages ${g.ages}): you can see ${sees}. Your parent chooses these settings.`;
  }
  const g = ageGroup(ageFrom(birthDate));
  return `${g.label} (${g.range}): you can see ${g.sees}.`;
}

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Settings</h1>
        <LinkButton href="/settings/profile" variant="secondary">
          Edit profile
        </LinkButton>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  const user = await requireUser();
  const [prefs, blocks, shop, kid] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { birthDate: true, hideMature: true, hiddenWarnings: true } }),
    prisma.block.findMany({
      where: { blockerId: user.id },
      orderBy: { createdAt: "desc" },
      select: { blocked: { select: { username: true, image: true } } },
    }),
    shopState(user.id),
    getKidState(user.id),
  ]);
  return (
    <div className="space-y-12">
      <section aria-labelledby="content-heading">
        <h2 id="content-heading" className="mb-4 font-display text-2xl font-semibold">
          Reading &amp; content
        </h2>
        <ContentPrefsForm
          birthDate={prefs.birthDate ? prefs.birthDate.toISOString().slice(0, 10) : null}
          ageGroup={ageGroupText(prefs.birthDate, kid)}
          hideMature={prefs.hideMature}
          hiddenWarnings={prefs.hiddenWarnings}
        />
      </section>
      <section aria-labelledby="theme-heading">
        <h2 id="theme-heading" className="mb-1 font-display text-2xl font-semibold">
          Homepage theme
        </h2>
        <p className="mb-4 text-sm text-ink-soft">
          Themes you own. Get more in the{" "}
          <Link href="/shop" className="font-semibold text-accent hover:underline">
            theme shop
          </Link>
          .
        </p>
        <ul className="flex flex-wrap gap-3">
          {shop.themes
            .filter((t) => t.owned && !t.locked)
            .map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="font-semibold">{t.name}</span>
                {t.applied ? <span className="text-sm font-semibold text-success">✓ In use</span> : <ApplyButton themeId={t.id} label="Use" />}
              </li>
            ))}
        </ul>
      </section>
      <section aria-labelledby="blocked-heading">
        <h2 id="blocked-heading" className="mb-1 font-display text-2xl font-semibold">
          Blocked users
        </h2>
        <p className="mb-4 text-sm text-ink-soft">They can’t comment on your books, and their books and comments are hidden from you.</p>
        <BlockedList users={blocks.map((b) => b.blocked)} />
      </section>
      <section aria-labelledby="security-heading">
        <h2 id="security-heading" className="mb-1 font-display text-2xl font-semibold">
          Security
        </h2>
        <p className="mb-4 text-sm text-ink-soft">Lost a device, or logged in somewhere you shouldn’t have? This signs you out everywhere, including here.</p>
        <form action={signOutEverywhereAction}>
          <Button type="submit" variant="secondary">
            Sign out on all devices
          </Button>
        </form>
      </section>
    </div>
  );
}
