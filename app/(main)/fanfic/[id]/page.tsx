import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { ActionBar } from "@/components/reader/ActionBar";
import { MusicPlayer } from "@/components/reader/MusicPlayer";
import { RichText } from "@/components/reader/RichText";
import { ViewTracker } from "@/components/reader/ViewTracker";
import { ReaderSurface } from "@/components/reader/ReaderSurface";
import { AuthorNote, FollowButton, MatureGate, ProgressTracker } from "@/components/reader/ReaderBits";
import { Cover } from "@/components/fanfic/Cover";
import { LengthLine, RatingBadge, StatusBadge, TagChips, WarningsLine } from "@/components/fanfic/BookMeta";
import { ManageStory } from "@/components/fanfic/ManageStory";
import { CoinBurst } from "@/components/coins/CoinBurst";
import { BookAdminMenu } from "@/components/admin/menus";
import { Handle } from "@/components/ui/AdminBadge";
import { Avatar } from "@/components/ui/Avatar";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { LocalDateTime } from "@/components/ui/RelativeTime";
import { ChartIcon, ChevronIcon, EyeIcon, ListIcon } from "@/components/ui/icons";
import { maybeProcessDueChapters } from "@/lib/announce";
import { getKidState } from "@/lib/family";
import { RATING_AGES, RATING_LABEL, RATING_MIN_AGE } from "@/lib/content";
import { prisma } from "@/lib/db";
import { getFanficForReader, getRemovedNotice } from "@/lib/queries";
import { parseReaderPrefs } from "@/lib/reader-prefs";
import { requireUser } from "@/lib/session";
import { formatCount, isActiveUntil } from "@/lib/utils";
import { getViewerContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Read" };

type Params = PageProps<"/fanfic/[id]">;

export default function ReaderPage(props: Params) {
  return (
    <Suspense fallback={<ReaderSkeleton />}>
      <Reader params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function num(value: string | string[] | undefined): number {
  const n = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(n) ? n : 1;
}

async function Reader({ params, searchParams }: { params: Params["params"]; searchParams: Params["searchParams"] }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  // Publish any scheduled chapters that came due, after this response is sent.
  after(maybeProcessDueChapters);

  const ctx = await getViewerContext(user);
  const [result, prefsRow] = await Promise.all([
    getFanficForReader(id, ctx, num(sp.ch), num(sp.p)),
    prisma.user.findUnique({ where: { id: user.id }, select: { readerPrefs: true } }),
  ]);
  if (!result) {
    // The author of a removed book sees why, with a way to appeal.
    const removed = await getRemovedNotice(id, user.id);
    if (removed) return <RemovedNotice book={removed} />;
    // Hidden stories 404 rather than 403 so their existence isn't revealed.
    notFound();
  }
  if (result.kind === "minor" && result.family) {
    return (
      <Notice title="This book isn’t available on your account">
        {result.rating === "MATURE"
          ? "Mature books aren’t available on accounts for readers under 16."
          : "Your account only shows books rated Everyone. Your parent can change this in their family dashboard."}
      </Notice>
    );
  }
  if (result.kind === "minor") {
    const ages = RATING_AGES[result.rating];
    return (
      <Notice title={`This book is for readers ${ages}`}>
        It’s marked {RATING_LABEL[result.rating]} ({ages}), so it’s only available to readers {RATING_MIN_AGE[result.rating]} and over. If
        your date of birth is wrong,{" "}
        <Link href="/messages" className="font-semibold text-accent hover:underline">
          message the admin
        </Link>
        .
      </Notice>
    );
  }
  if (result.kind === "blocked") {
    return (
      <Notice title="You blocked this author">
        Their books and comments are hidden from you. You can unblock them in{" "}
        <Link href="/settings" className="font-semibold text-accent hover:underline">
          settings
        </Link>
        .
      </Notice>
    );
  }

  const data = result.data;
  const { story, position, content } = data;
  const isAuthor = story.authorId === user.id;
  const isParent = ctx.childIds.includes(story.authorId);
  // Kids' accounts: comments off (reader's or author's setting) hides comments; "no following" hides Follow.
  const authorKid = await getKidState(story.authorId);
  const commentsOff = !ctx.isAdmin && Boolean(ctx.kid?.controls.commentsOff || authorKid?.controls.commentsOff);
  const canFollow = !ctx.kid?.controls.noFollow && !authorKid?.controls.noFollow;
  const chapter = story.chapters[position.chapterIndex];
  const href = (c: number, p: number) => `/fanfic/${story.id}?ch=${c + 1}&p=${p + 1}`;
  const scheduled = (c?: { publishAt: Date | null }) => Boolean(c?.publishAt && isActiveUntil(c.publishAt));

  const prev =
    position.pageIndex > 0
      ? href(position.chapterIndex, position.pageIndex - 1)
      : position.chapterIndex > 0
        ? href(position.chapterIndex - 1, story.chapters[position.chapterIndex - 1].pages.length - 1)
        : null;
  const next =
    chapter && position.pageIndex < chapter.pages.length - 1
      ? href(position.chapterIndex, position.pageIndex + 1)
      : position.chapterIndex < story.chapters.length - 1
        ? href(position.chapterIndex + 1, 0)
        : null;
  const isFirstPage = position.chapterIndex === 0 && position.pageIndex === 0;
  const isChapterStart = position.pageIndex === 0;
  const isChapterEnd = chapter && position.pageIndex === chapter.pages.length - 1;

  const page = (
    <>
      {chapter?.noteStart && isChapterStart && <AuthorNote text={chapter.noteStart} where="start" />}
      {content ? <RichText doc={content} /> : <EmptyState title="Nothing here yet">This story doesn’t have any pages.</EmptyState>}
      {chapter?.noteEnd && isChapterEnd && <AuthorNote text={chapter.noteEnd} where="end" />}
    </>
  );

  return (
    <article className="mx-auto max-w-3xl px-4 pt-8 pb-36 sm:px-6">
      <ViewTracker fanficId={story.id} />
      {chapter && <ProgressTracker fanficId={story.id} chapterId={chapter.id} pageIndex={position.pageIndex} />}

      {ctx.isAdmin && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-ink/15 bg-muted px-4 py-2.5 text-sm">
          <span className="font-semibold">{story.removed ? `Removed: ${story.removedReason ?? "by moderation"}` : "Admin tools"}</span>
          <span className="ml-auto">
            <BookAdminMenu
              book={{
                id: story.id,
                removed: story.removed,
                featured: story.featured,
                hotMode: story.hotMode,
                commentsLocked: story.commentsLocked,
                visibility: story.visibility,
              }}
            />
          </span>
        </div>
      )}

      {typeof sp.coins === "string" && isAuthor && <CoinBurst amount={Number(sp.coins)} />}
      {story.visibility !== "PUBLIC" && (
        <p className="mb-6 rounded-xl border border-plum/30 bg-plum-soft px-4 py-2.5 text-sm font-medium text-plum">
          {story.awaitingApproval
            ? isParent
              ? `@${story.author.username} asked to publish this book. Read it, then approve it in your family dashboard.`
              : "Waiting for your parent’s approval. It’s posted for everyone once they say yes."
            : story.visibility === "DRAFT"
              ? isParent
                ? `A draft by @${story.author.username}. You can see it because you’re their parent.`
                : "Draft preview: only you can see this. Post it from the editor when it’s ready."
              : isAuthor
                ? "Posted privately: only you can see this story."
                : isParent
                  ? `Posted privately by @${story.author.username}. You can see it because you’re their parent.`
                  : "This story isn’t public. You can see it because you’re the admin."}
          {story.awaitingApproval && isParent && (
            <Link href={`/family/${story.authorId}#approve`} className="ml-2 font-semibold underline">
              Go to approval
            </Link>
          )}
        </p>
      )}

      {isFirstPage && (
        <header className="mb-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <Cover src={story.coverUrl} title={story.title} className="w-40 shrink-0 shadow-lift sm:w-48" sizes="12rem" priority />
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <RatingBadge rating={story.rating} />
                <StatusBadge status={story.status} />
              </div>
              <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">{story.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link href={`/u/${story.author.username}`} className="inline-flex items-center gap-2 text-ink-soft hover:text-ink">
                  <Avatar src={story.author.image} name={story.author.username} size={28} />
                  <span className="font-semibold">
                    <Handle username={story.author.username} role={story.author.role} />
                  </span>
                </Link>
                {!isAuthor && canFollow && <FollowButton username={story.author.username} initial={data.followingAuthor} sourceFanficId={story.id} />}
              </div>
              <p className="mt-2 flex items-center gap-3 text-sm text-ink-soft">
                <span className="inline-flex items-center gap-1">
                  <EyeIcon className="size-4" /> {formatCount(story.views)}
                </span>
              </p>
              <LengthLine words={data.words} chapters={data.publishedChapters} className="mt-1 text-sm" />
              {isAuthor && !story.removed && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <ManageStory fanficId={story.id} visibility={story.visibility} afterDelete={`/u/${story.author.username}`} />
                  <LinkButton href={`/fanfic/${story.id}/stats`} variant="ghost" size="sm">
                    <ChartIcon className="size-4" /> Stats
                  </LinkButton>
                </div>
              )}
            </div>
          </div>
          {story.summary && <p className="mt-6 font-read text-lg leading-relaxed whitespace-pre-line text-ink-soft">{story.summary}</p>}
          <WarningsLine warnings={story.warnings} className="mt-4 text-sm" />
          <TagChips tags={story.tags} className="mt-4" />
        </header>
      )}

      {story.musicUrl && (
        <div className="mb-8">
          <MusicPlayer url={story.musicUrl} defaultVolume={story.musicVolume} />
        </div>
      )}

      {story.chapters.length > 0 && chapter ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-accent uppercase">
              Chapter {position.chapterIndex + 1} · Page {position.pageIndex + 1} of {chapter.pages.length}
            </p>
            {chapter.title && <h2 className="mt-1 font-display text-2xl font-semibold">{chapter.title}</h2>}
            {scheduled(chapter) && (
              <p className="mt-1 text-sm font-medium text-plum">
                Scheduled for <LocalDateTime iso={chapter.publishAt!.toISOString()} />. Readers can’t see this chapter yet.
              </p>
            )}
          </div>
          <details className="group relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden">
              <ListIcon className="size-4" /> Chapters
            </summary>
            <ol className="absolute right-0 z-30 mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lift">
              {story.chapters.map((ch, i) => (
                <li key={ch.id}>
                  <Link
                    href={href(i, 0)}
                    aria-current={i === position.chapterIndex ? "page" : undefined}
                    className="flex gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold aria-[current=page]:text-accent"
                  >
                    <span className="text-ink-soft tabular-nums">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{ch.title || `Chapter ${i + 1}`}</span>
                    <span className="text-xs text-ink-soft">{scheduled(ch) ? "scheduled" : `${ch.pages.length}p`}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </details>
        </div>
      ) : (
        story.visibility === "PUBLIC" && (
          <EmptyState title="The first chapter is on its way">The author has scheduled it. Follow them to get a notification when it’s out.</EmptyState>
        )
      )}

      {chapter && (
        <ReaderSurface initial={parseReaderPrefs(prefsRow?.readerPrefs)}>
          <div className="pt-10">{story.rating === "MATURE" && !isAuthor && isFirstPage ? <MatureGate fanficId={story.id}>{page}</MatureGate> : page}</div>
        </ReaderSurface>
      )}

      <nav aria-label="Pages" className="mt-14 flex items-center justify-between gap-3">
        {prev ? (
          <LinkButton href={prev} variant="secondary" size="lg">
            <ChevronIcon dir="left" className="size-4" /> Previous
          </LinkButton>
        ) : (
          <span />
        )}
        {next ? (
          <LinkButton href={next} size="lg">
            Next <ChevronIcon className="size-4" />
          </LinkButton>
        ) : (
          chapter && <p className="font-display text-lg text-ink-soft italic">{story.status === "COMPLETED" ? "The end ✦" : "To be continued ✦"}</p>
        )}
      </nav>

      <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div className="relative">
          <ActionBar
            fanficId={story.id}
            title={story.title}
            initial={{ mine: data.myReaction, likeCount: story.likeCount, dislikeCount: story.dislikeCount }}
            commentCount={story.commentCount}
            hasReported={data.hasReported}
            isAuthor={isAuthor}
            viewerId={user.id}
            viewerIsAdmin={ctx.isAdmin}
            interactive={story.visibility !== "DRAFT" && !story.removed}
            saved={data.saved}
            commentsOff={commentsOff}
          />
        </div>
      </div>
    </article>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-ink-soft">{children}</p>
      <LinkButton href="/" className="mt-8">
        Back to the homepage
      </LinkButton>
    </div>
  );
}

function RemovedNotice({ book }: { book: { id: string; title: string; removedReason: string | null } }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <p className="text-xs font-bold tracking-widest text-danger uppercase">Removed</p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{book.title}</h1>
      <p className="mt-3 text-ink-soft">This book was removed from Writt, so nobody else can see it.</p>
      {book.removedReason && <p className="mt-3 rounded-xl bg-muted px-4 py-3 text-sm">Reason: {book.removedReason}</p>}
      <div className="mt-8 flex justify-center gap-3">
        <LinkButton href={`/appeals/new?book=${book.id}`}>Appeal this removal</LinkButton>
        <LinkButton href="/appeals" variant="secondary">
          My appeals
        </LinkButton>
      </div>
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 sm:px-6" aria-busy="true" aria-label="Loading story">
      <div className="flex gap-6">
        <Skeleton className="aspect-[2/3] w-40" />
        <div className="flex-1 space-y-3 pt-16">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
        </div>
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-5" />
      ))}
    </div>
  );
}
