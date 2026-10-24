import Link from "next/link";
import type { ReactNode } from "react";
import type { FanficCardData } from "@/lib/queries";
import { formatCount } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Handle } from "@/components/ui/AdminBadge";
import { EyeIcon, FlameIcon, HeartIcon } from "@/components/ui/icons";
import { LengthLine, RatingBadge, StatusBadge, WarningsLine } from "./BookMeta";
import { Cover } from "./Cover";

export function HotLabel() {
  return (
    <span className="inline-flex -rotate-3 items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-black tracking-[0.15em] text-on-accent uppercase shadow-card">
      <FlameIcon className="size-3.5" /> Hot
    </span>
  );
}

function Stamp({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex rotate-2 items-center rounded-md px-2 py-1 text-[11px] font-black tracking-[0.15em] uppercase shadow-card ${className}`}>
      {children}
    </span>
  );
}

export function FanficCard({ story, footer, priority }: { story: FanficCardData; footer?: ReactNode; priority?: boolean }) {
  return (
    <article data-theme-part="card" className="group relative flex flex-col">
      <div data-theme-part="cover" className="relative transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift">
        <Cover src={story.coverUrl} title={story.title} className="shadow-card" priority={priority} />
        <span className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5">
          {story.removed && <Stamp className="bg-danger text-white">Removed</Stamp>}
          {story.featured && !story.removed && <Stamp className="bg-plum text-[#f6f1e7]">Featured</Stamp>}
          {story.hot && <HotLabel />}
        </span>
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <h3 className="line-clamp-2 font-display text-lg leading-snug font-semibold">
          <Link href={`/fanfic/${story.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
            {story.title}
          </Link>
        </h3>
        <Link
          href={`/u/${story.author.username}`}
          className="relative z-10 mt-1.5 inline-flex w-fit items-center gap-2 rounded-md text-sm text-ink-soft hover:text-ink"
        >
          <Avatar src={story.author.image} name={story.author.username} size={22} />
          <Handle username={story.author.username} role={story.author.role} />
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <RatingBadge rating={story.rating} />
          {story.visibility !== "DRAFT" && <StatusBadge status={story.status} />}
        </div>
        {(story.summary || story.excerpt) && (
          <p className="mt-2 line-clamp-3 font-read text-sm leading-relaxed text-ink-soft">{story.summary || story.excerpt}</p>
        )}
        <WarningsLine warnings={story.warnings} className="mt-1.5 line-clamp-1" />
        <LengthLine words={story.wordCount} chapters={story.chapterCount} className="mt-1.5" />
        <dl className="mt-auto flex items-center gap-4 pt-3 text-xs font-semibold text-ink-soft">
          <div className="flex items-center gap-1">
            <dt className="sr-only">Views</dt>
            <EyeIcon className="size-4" />
            <dd>{formatCount(story.views)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="sr-only">Likes</dt>
            <HeartIcon className="size-4" />
            <dd>{formatCount(story.likeCount)}</dd>
          </div>
        </dl>
        {footer && <div className="relative z-10 mt-3">{footer}</div>}
      </div>
    </article>
  );
}

export function FanficGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}
