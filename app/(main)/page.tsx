import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { FanficCard, FanficGrid } from "@/components/fanfic/FanficCard";
import { Tutorial } from "@/components/onboarding/Tutorial";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { PenIcon, SearchIcon } from "@/components/ui/icons";
import { ThemeDecor } from "@/components/shop/ThemeDecor";
import { ThemeHeader } from "@/components/shop/ThemeHeader";
import { maybeProcessDueChapters } from "@/lib/announce";
import { ageFrom } from "@/lib/content";
import { maybeRunFamilyJobs } from "@/lib/family";
import { canPreviewTheme } from "@/lib/theme-shop";
import { DEFAULT_THEME, themeToShow, type ThemeDef } from "@/lib/themes";
import {
  getContinueReading,
  getFeatured,
  getFollowingFeed,
  getLatest,
  getPopular,
  getTopTags,
  type FanficCardData,
} from "@/lib/queries";
import { getCurrentUser, requireUser, type CurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getViewerContext, type ViewerContext } from "@/lib/viewer";

export default function HomePage(props: PageProps<"/">) {
  return (
    <>
      <Suspense
        fallback={
          <HomeFrame theme={DEFAULT_THEME}>
            <Hero />
            <FeedSkeleton />
          </HomeFrame>
        }
      >
        <ThemedHome searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <TutorialGate />
      </Suspense>
    </>
  );
}

/** The homepage in the user's theme (lib/themes.ts), or a theme they're previewing from the shop. */
async function ThemedHome({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  after(maybeRunFamilyJobs);
  // The server picks the theme: Analog Horror never shows for anyone under 12, even if stored.
  let theme = themeToShow(user.homeTheme, ageFrom(user.birthDate));
  let preview: ThemeDef | null = null;
  let previewError: string | null = null;
  if (typeof sp.preview === "string") {
    const check = await canPreviewTheme(user.id, sp.preview);
    if (check.ok) {
      preview = check.theme;
      theme = check.theme.id;
    } else {
      previewError = check.error;
    }
  }
  return (
    <HomeFrame theme={theme}>
      {preview && (
        <div role="status" className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-surface px-4 py-3 text-sm shadow-card">
          <span className="font-semibold">Previewing {preview.name}: this is how your homepage would look.</span>
          <Link href={`/shop#theme-${preview.id}`} className="ml-auto font-semibold text-accent hover:underline">
            Back to the shop
          </Link>
        </div>
      )}
      {previewError && (
        <p role="alert" className="mb-8 rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {previewError}
        </p>
      )}
      <ThemeHeader theme={theme} />
      <Hero />
      <Suspense fallback={<FeedSkeleton />}>
        <HomeContent sp={sp} user={user} />
      </Suspense>
    </HomeFrame>
  );
}

/** Full-width area the theme colors; the page content stays centered inside. */
function HomeFrame({ theme, children }: { theme: string; children: React.ReactNode }) {
  return (
    <div data-home-theme={theme === DEFAULT_THEME ? undefined : theme} className="relative min-h-full text-ink">
      {theme === "analog-horror" && <div className="vhs-tracking" aria-hidden />}
      <ThemeDecor theme={theme} />
      <div className="relative z-[1] mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>
    </div>
  );
}

async function TutorialGate() {
  const user = await getCurrentUser();
  return user && !user.needsSetup && !user.hasSeenTutorial ? <Tutorial /> : null;
}

function Hero() {
  return (
    <section data-theme-part="hero" className="mb-10 grid items-end gap-6 md:grid-cols-[1fr_auto]">
      <div>
        <p data-theme-part="kicker" className="w-fit text-sm font-bold tracking-widest text-accent uppercase">
          Writt
        </p>
        <h1 className="mt-2 max-w-2xl font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
          What will you read <em className="text-accent">tonight?</em>
        </h1>
        <form action="/browse" role="search" className="mt-6 flex max-w-xl gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search by title, author, fandom or tag</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-soft/60" />
            <input
              name="q"
              type="search"
              placeholder="Title, @author, fandom or tag"
              className="h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-12 text-base shadow-card placeholder:text-ink-soft/60 focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
            />
          </label>
          <button type="submit" className="h-12 rounded-2xl bg-ink px-5 font-semibold text-paper transition hover:opacity-90">
            Search
          </button>
        </form>
      </div>
      <LinkButton href="/create" variant="secondary" size="lg" className="hidden md:inline-flex">
        <PenIcon className="size-4" /> Start a story
      </LinkButton>
    </section>
  );
}

async function HomeContent({ sp, user }: { sp: Awaited<PageProps<"/">["searchParams"]>; user: CurrentUser }) {
  after(maybeProcessDueChapters);
  const ctx = await getViewerContext(user);
  const tab = sp.tab === "following" ? "following" : "discover";

  return (
    <>
      {sp.reported === "removed" && (
        <p role="status" className="mb-8 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          Thanks for reporting. That story was reported by many readers and has now been removed from Writt.
        </p>
      )}
      <ContinueReading ctx={ctx} />
      <nav aria-label="Home feeds" className="mb-8 flex gap-1 border-b border-line">
        {(["discover", "following"] as const).map((t) => (
          <Link
            key={t}
            href={t === "discover" ? "/" : "/?tab=following"}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold capitalize",
              tab === t ? "border-accent text-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t}
          </Link>
        ))}
      </nav>
      {tab === "following" ? <Following ctx={ctx} /> : <Discover ctx={ctx} />}
    </>
  );
}

async function ContinueReading({ ctx }: { ctx: ViewerContext }) {
  const items = await getContinueReading(ctx, 6);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="continue-heading" className="mb-12">
      <SectionHeading id="continue-heading" kicker="Pick up where you left off" title="Continue reading" />
      <ul className="flex snap-x gap-4 overflow-x-auto pb-2">
        {items.map(({ book, href, label }) => (
          <li key={book.id} className="w-64 shrink-0 snap-start">
            <Link href={href} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className="line-clamp-2 font-display text-lg leading-snug font-semibold">{book.title}</span>
              <span className="mt-1 text-sm text-ink-soft">@{book.author.username}</span>
              <span className="mt-auto pt-3 text-xs font-bold tracking-widest text-accent uppercase">{label} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Following({ ctx }: { ctx: ViewerContext }) {
  const { following, books } = await getFollowingFeed(ctx);
  if (following === 0) {
    return (
      <EmptyState title="You’re not following anyone yet">
        Press <strong>Follow</strong> on an author’s profile or book to see their new books and chapters here.
      </EmptyState>
    );
  }
  if (books.length === 0) return <EmptyState title="Nothing new yet">The authors you follow haven’t posted anything you can read yet.</EmptyState>;
  return (
    <section aria-labelledby="following-heading">
      <SectionHeading id="following-heading" kicker={`From ${following} author${following === 1 ? "" : "s"} you follow`} title="New books and chapters" />
      <Grid stories={books} />
    </section>
  );
}

async function Discover({ ctx }: { ctx: ViewerContext }) {
  const [featured, popular, latest, fandoms, tags] = await Promise.all([
    getFeatured(ctx),
    getPopular(ctx),
    getLatest(ctx),
    getTopTags("FANDOM", 12),
    getTopTags("TAG", 24),
  ]);
  if (popular.length === 0 && featured.length === 0) {
    return (
      <div data-tour="feed">
        <EmptyState
          title="The shelves are empty"
          action={
            <LinkButton href="/create">
              <PenIcon className="size-4" /> Write the first story
            </LinkButton>
          }
        >
          No one has posted a story yet. Yours could be the first thing everyone reads.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="space-y-16">
      {featured.length > 0 && (
        <section aria-labelledby="featured-heading">
          <SectionHeading id="featured-heading" kicker="Picked by Writt" title="Featured" />
          <Grid stories={featured} priority />
        </section>
      )}
      <section aria-labelledby="popular-heading" data-tour="feed">
        <SectionHeading id="popular-heading" kicker="Most read" title="Popular right now" href="/browse?sort=hot" />
        <Grid stories={popular} priority={featured.length === 0} />
      </section>
      {fandoms.length > 0 && (
        <section aria-labelledby="fandoms-heading">
          <SectionHeading id="fandoms-heading" kicker="Find your people" title="Browse by fandom" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fandoms.map((f, i) => (
              <li key={f.id}>
                <Link
                  href={`/t/${f.id}`}
                  data-theme-part="fandom"
                  className={cn(
                    "flex h-24 flex-col justify-between rounded-2xl p-4 font-display text-lg leading-tight font-semibold shadow-card transition hover:-translate-y-0.5 hover:shadow-lift",
                    ["bg-plum text-[#f6f1e7]", "bg-accent text-on-accent", "bg-[#1f4d45] text-[#eef6ef]", "bg-ink text-paper"][i % 4],
                  )}
                >
                  <span className="line-clamp-2">{f.name}</span>
                  <span className="font-sans text-xs font-semibold opacity-80">
                    {f.books} book{f.books === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tags.length > 0 && (
        <section aria-labelledby="tags-heading">
          <SectionHeading id="tags-heading" kicker="What people are writing" title="Popular tags" />
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/t/${t.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent"
                >
                  {t.name}
                  <span className="text-xs font-normal text-ink-soft">{t.books}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="latest-heading">
        <SectionHeading id="latest-heading" kicker="Fresh ink" title="Latest" href="/browse?sort=new" />
        <Grid stories={latest} />
      </section>
    </div>
  );
}

function SectionHeading({ id, kicker, title, href }: { id: string; kicker: string; title: string; href?: string }) {
  return (
    <div data-theme-part="heading" className="mb-6 flex items-end gap-4">
      <div>
        <p data-theme-part="kicker" className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {kicker}
        </p>
        <h2 id={id} className="font-display text-3xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      <span data-theme-part="rule" className="mb-2 h-px flex-1 bg-line" aria-hidden />
      {href && (
        <Link href={href} className="mb-1 text-sm font-semibold text-ink-soft hover:text-accent">
          See all →
        </Link>
      )}
    </div>
  );
}

function Grid({ stories, priority }: { stories: FanficCardData[]; priority?: boolean }) {
  return (
    <FanficGrid>
      {stories.map((story, i) => (
        <FanficCard key={story.id} story={story} priority={priority && i < 4} />
      ))}
    </FanficGrid>
  );
}

function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading stories">
      <Skeleton className="mb-8 h-10 w-64" />
      <FanficGrid>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3]" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </FanficGrid>
    </div>
  );
}
