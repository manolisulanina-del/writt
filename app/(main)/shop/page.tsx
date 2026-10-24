import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApplyButton, BuyButton } from "@/components/shop/ShopControls";
import { ThemePreview } from "@/components/shop/ThemePreview";
import { LinkButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/EmptyState";
import { CoinIcon } from "@/components/ui/icons";
import { COINS, shortfallMessage } from "@/lib/coin-rules";
import { requireUser } from "@/lib/session";
import { shopState } from "@/lib/theme-shop";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Theme shop" };

export default function ShopPage(props: PageProps<"/shop">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton className="h-[36rem]" />}>
        <Shop searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Shop({ searchParams }: { searchParams: PageProps<"/shop">["searchParams"] }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const state = await shopState(user.id);
  const tab = sp.tab === "mine" ? "mine" : "shop";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-widest text-accent uppercase">Homepage themes</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Theme shop</h1>
        </div>
        <p className="inline-flex items-center gap-2 rounded-full bg-[#f5c542]/20 px-4 py-2 text-lg font-bold tabular-nums">
          <CoinIcon className="size-5 text-[#b8860b] dark:text-[#f5c542]" /> {state.unlimited ? "∞" : state.coins.toLocaleString()} coins
        </p>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Earn coins by writing: +{COINS.book} for each new public book and +{COINS.chapter} for each new chapter, if it has at least {COINS.minWords}{" "}
        words (up to {COINS.booksPerDay} books and {COINS.chaptersPerDay} chapters a day). Coins can’t be bought or sent to other people.
      </p>

      <nav aria-label="Shop" className="mt-8 mb-8 flex gap-1 border-b border-line">
        {(
          [
            ["shop", "Shop", "/shop"],
            ["mine", "My themes", "/shop?tab=mine"],
          ] as const
        ).map(([id, label, href]) => (
          <Link
            key={id}
            href={href}
            aria-current={tab === id ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold", tab === id ? "border-accent text-ink" : "border-transparent text-ink-soft hover:text-ink")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "mine" ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {state.themes
            .filter((t) => t.owned)
            .map((t) => (
              <li key={t.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <ThemePreview theme={t.id} locked={t.locked} />
                <h2 className="mt-3 font-display text-xl font-semibold">{t.name}</h2>
                <div className="mt-3">
                  {t.locked ? (
                    <p className="text-sm text-ink-soft">Available when you turn {t.minAge}.</p>
                  ) : t.applied ? (
                    <p className="text-sm font-semibold text-success">✓ On your homepage</p>
                  ) : (
                    <ApplyButton themeId={t.id} />
                  )}
                </div>
              </li>
            ))}
        </ul>
      ) : state.shopOff ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="font-display text-2xl font-semibold">The shop is turned off on your account.</p>
          <p className="mt-2 text-ink-soft">Your parent can turn it back on. You can still use themes you own from My themes.</p>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {state.themes.map((t) => {
            const short = state.unlimited ? null : shortfallMessage(state.coins, t.price);
            return (
              <li key={t.id} id={`theme-${t.id}`} className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
                <ThemePreview theme={t.id} locked={t.locked} />
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold">{t.name}</h2>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{t.price === 0 ? "Free" : `${t.price} coins`}</span>
                </div>
                <p className="mt-1 flex-1 text-sm text-ink-soft">{t.description}</p>
                {t.minAge > 0 && <p className="mt-1 text-xs font-semibold text-ink-soft">Ages {t.minAge}+</p>}
                <div className="mt-4 space-y-2">
                  {t.locked ? (
                    <p className="text-sm font-semibold text-ink-soft">🔒 Available when you turn {t.minAge}</p>
                  ) : (
                    <div className="flex flex-wrap items-start gap-2">
                      {t.id !== "default" && (
                        <LinkButton href={`/?preview=${t.id}`} variant="ghost" size="sm">
                          Preview
                        </LinkButton>
                      )}
                      {t.owned ? (
                        t.applied ? (
                          <span className="inline-flex h-9 items-center text-sm font-semibold text-success">✓ In use</span>
                        ) : (
                          <ApplyButton themeId={t.id} label={t.id === "default" ? "Use Default" : "Use"} />
                        )
                      ) : short ? (
                        <p className="text-sm font-medium text-ink-soft">{short}</p>
                      ) : (
                        <BuyButton themeId={t.id} name={t.name} price={t.price} />
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
