import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RATING_MIN_AGE, ageFrom, tooYoungFor } from "@/lib/content";
import { getChildIds, getKidState, type KidState } from "@/lib/family";
import { hiddenRatingsForKid } from "@/lib/kids";
import { type CurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";

/**
 * What a signed-in reader may see. Readers never see books whose age range is
 * above their age (Teen 13+, Mature 18+; no birth date counts as a child).
 * Kids (7 to 15) follow their family restrictions instead: Teen depends on the
 * parent's settings, and Mature is always hidden. Adults can hide Mature books,
 * and chosen warnings, from feeds. Books and comments by users they blocked are
 * hidden. The admin sees everything.
 */
export type ViewerContext = {
  id: string;
  role: "USER" | "ADMIN";
  isAdmin: boolean;
  /** Null when unknown. Always null for the admin, who sees every age range. */
  age: number | null;
  hideMature: boolean;
  hiddenWarnings: string[];
  /** Users this viewer blocked. */
  blockedIds: string[];
  /** Book age ranges this viewer may never see, anywhere. */
  hiddenRatings: ("TEEN" | "MATURE")[];
  /** Set for kids aged 7 to 15. */
  kid: KidState | null;
  /** Children linked to this viewer's family account. */
  childIds: string[];
};

export const getViewerContext = cache(async (user: CurrentUser): Promise<ViewerContext> => {
  const admin = isAdmin(user);
  const [prefs, blocks, kid, childIds] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { birthDate: true, hideMature: true, hiddenWarnings: true } }),
    admin ? [] : prisma.block.findMany({ where: { blockerId: user.id }, select: { blockedId: true } }),
    admin ? null : getKidState(user.id),
    getChildIds(user.id),
  ]);
  const age = ageFrom(prefs?.birthDate);
  const hiddenRatings = admin
    ? []
    : kid
      ? hiddenRatingsForKid(kid.controls)
      : (Object.keys(RATING_MIN_AGE).filter((r) => tooYoungFor(r, age)) as ("TEEN" | "MATURE")[]);
  return {
    id: user.id,
    role: admin ? "ADMIN" : "USER",
    isAdmin: admin,
    age: admin ? null : age,
    hideMature: !admin && Boolean(prefs?.hideMature),
    hiddenWarnings: admin ? [] : (prefs?.hiddenWarnings ?? []),
    blockedIds: blocks.map((b) => b.blockedId),
    hiddenRatings,
    kid,
    childIds,
  };
});

/** Prisma filter for books this viewer may see in lists. `feed` also applies their feed preferences. */
export function bookFilter(ctx: ViewerContext, feed: boolean): Prisma.FanficWhereInput {
  const and: Prisma.FanficWhereInput[] = [];
  if (ctx.blockedIds.length) and.push({ authorId: { notIn: ctx.blockedIds } });
  const hidden = [...ctx.hiddenRatings];
  if (feed && ctx.hideMature && !hidden.includes("MATURE")) hidden.push("MATURE");
  if (hidden.length) and.push({ NOT: { rating: { in: hidden } } });
  if (feed && ctx.hiddenWarnings.length) and.push({ NOT: { warnings: { hasSome: ctx.hiddenWarnings } } });
  return and.length ? { AND: and } : {};
}

type Filterable = { rating: string | null; warnings: string[] };

/** In-code version of bookFilter, for lists that come from a shared cache. */
export function allowedForViewer(book: Filterable & { authorId: string }, ctx: ViewerContext, feed: boolean): boolean {
  if (ctx.blockedIds.includes(book.authorId)) return false;
  if (book.rating && (ctx.hiddenRatings as string[]).includes(book.rating)) return false;
  if (book.rating === "MATURE" && feed && ctx.hideMature) return false;
  if (feed && book.warnings.some((w) => ctx.hiddenWarnings.includes(w))) return false;
  return true;
}
