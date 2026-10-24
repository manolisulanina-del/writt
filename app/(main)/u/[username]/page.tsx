import type { Metadata } from "next";
import type { Visibility } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { FanficCard, FanficGrid } from "@/components/fanfic/FanficCard";
import { CreationBlockedNotice } from "@/components/fanfic/CreationBlockedNotice";
import { ManageStory } from "@/components/fanfic/ManageStory";
import { UserAdminMenu } from "@/components/admin/menus";
import { FollowButton } from "@/components/reader/ReaderBits";
import { BlockButton } from "@/components/settings/SettingsForms";
import { Handle } from "@/components/ui/AdminBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { PenIcon } from "@/components/ui/icons";
import { getCreationBlock } from "@/lib/moderation";
import { getAuthorFanfics, getProfile } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { getViewerContext } from "@/lib/viewer";
import { getChildIds, getKidState } from "@/lib/family";
import { cn, formatCount, isActiveUntil } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

type Params = PageProps<"/u/[username]">;

const TABS: { id: string; label: string; visibility: Visibility; ownerOnly: boolean }[] = [
  { id: "published", label: "Published", visibility: "PUBLIC", ownerOnly: false },
  { id: "private", label: "Private", visibility: "PRIVATE", ownerOnly: true },
  { id: "drafts", label: "Drafts", visibility: "DRAFT", ownerOnly: true },
];

export default function ProfilePage(props: Params) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Profile({ params, searchParams }: { params: Params["params"]; searchParams: Params["searchParams"] }) {
  const [{ username }, sp, viewer] = await Promise.all([params, searchParams, requireUser()]);
  const profile = await getProfile(decodeURIComponent(username), viewer.id);
  if (!profile) notFound();

  const isOwner = profile.id === viewer.id;
  const viewerIsAdmin = isAdmin(viewer);
  // Kids' accounts: a "simple profile" shows only the username, picture and books.
  const [profileKid, viewerKid] = await Promise.all([getKidState(profile.id), getKidState(viewer.id)]);
  const simple = Boolean(profileKid?.controls.limitedProfile);
  const canFollow = !profileKid?.controls.noFollow && !viewerKid?.controls.noFollow;
  // Only the real admin account shows the badge and can't be blocked.
  const isAdminProfile = profile.role === "ADMIN";
  const tabs = TABS.filter((t) => isOwner || !t.ownerOnly);
  // Non-owners asking for a private tab silently get the public one.
  const tab = tabs.find((t) => t.id === sp.tab) ?? tabs[0];
  const [stories, block] = await Promise.all([
    getAuthorFanfics(profile.id, tab.visibility, await getViewerContext(viewer)),
    isOwner ? getCreationBlock(profile.id) : null,
  ]);

  return (
    <>
      {block && (
        <div className="mb-8">
          <CreationBlockedNotice block={block} />
        </div>
      )}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar src={profile.image} name={profile.nickname ?? profile.username} size={112} className="shadow-card" />
        <div className="min-w-0 flex-1">
          {profile.nickname && !simple ? (
            <>
              <h1 className="font-display text-4xl font-semibold tracking-tight break-words">{profile.nickname}</h1>
              <p className="mt-0.5 font-semibold text-ink-soft">
                <Handle username={profile.username} role={profile.role} />
              </p>
            </>
          ) : (
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              <Handle username={profile.username} role={profile.role} />
            </h1>
          )}
          {simple ? null : profile.bio ? (
            <p className="mt-2 max-w-2xl font-read text-lg whitespace-pre-line text-ink-soft">{profile.bio}</p>
          ) : (
            isOwner && <p className="mt-2 text-ink-soft italic">Add a bio so readers know who you are.</p>
          )}
          {!simple && (
            <dl className="mt-4 flex flex-wrap gap-6">
              {[
                ["Stories", profile.stats.stories],
                ["Total views", profile.stats.views],
                ["Likes", profile.stats.likes],
                ["Followers", profile.stats.followers],
                ["Following", profile.stats.following],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-bold tracking-widest text-ink-soft uppercase">{label}</dt>
                  <dd className="font-display text-2xl font-semibold tabular-nums">{formatCount(value as number)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {isOwner && (
          <div className="flex gap-2 sm:flex-col">
            <LinkButton href="/settings/profile" variant="secondary">
              Edit profile
            </LinkButton>
            <LinkButton href="/settings" variant="ghost">
              Settings
            </LinkButton>
            <LinkButton href="/library" variant="ghost">
              My library
            </LinkButton>
            {(await getChildIds(viewer.id)).length > 0 && (
              <LinkButton href="/family" variant="ghost">
                Family dashboard
              </LinkButton>
            )}
            <LinkButton href="/messages" variant="ghost">
              {viewerIsAdmin ? "Inbox" : "Message admin"}
            </LinkButton>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" className="w-full">
                Sign out
              </Button>
            </form>
          </div>
        )}
        {!isOwner && (
          <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
            {!profile.iBlocked && canFollow && <FollowButton username={profile.username} initial={profile.isFollowing} size="md" />}
            {!isAdminProfile && <BlockButton username={profile.username} blocked={profile.iBlocked} />}
          </div>
        )}
        {viewerIsAdmin && !isOwner && (
          <UserAdminMenu
            align="right"
            user={{
              username: profile.username,
              banned: isActiveUntil(profile.bannedUntil),
              muted: isActiveUntil(profile.mutedUntil),
              blocked: isActiveUntil(profile.createBlockedUntil),
            }}
          />
        )}
      </header>

      <nav aria-label="Story lists" className="mt-10 mb-8 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/u/${profile.username}?tab=${t.id}`}
            aria-current={t.id === tab.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition",
              t.id === tab.id ? "border-accent text-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {stories.length === 0 ? (
        <EmptyState
          title={tab.id === "published" ? "No published stories yet" : tab.id === "private" ? "No private stories" : "No drafts"}
          action={
            isOwner && (
              <LinkButton href="/create">
                <PenIcon className="size-4" /> Start writing
              </LinkButton>
            )
          }
        >
          {isOwner
            ? tab.id === "drafts"
              ? "Choose “Draft” when you press Done in the editor to keep working on something."
              : "When you post a story it will show up here."
            : `@${profile.username} hasn’t published anything yet.`}
        </EmptyState>
      ) : (
        <FanficGrid>
          {stories.map((story) => (
            <FanficCard
              key={story.id}
              story={story}
              footer={
                isOwner &&
                (story.removed ? (
                  <LinkButton href={`/appeals/new?book=${story.id}`} variant="secondary" size="sm">
                    Appeal this removal
                  </LinkButton>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <ManageStory fanficId={story.id} visibility={story.visibility} compact />
                    {story.visibility === "PUBLIC" && (
                      <LinkButton href={`/fanfic/${story.id}/stats`} variant="ghost" size="sm">
                        Stats
                      </LinkButton>
                    )}
                  </div>
                ))
              }
            />
          ))}
        </FanficGrid>
      )}
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading profile" className="space-y-8">
      <div className="flex items-center gap-6">
        <Skeleton className="size-28 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-10" />
    </div>
  );
}
