import "server-only";
import { updateTag } from "next/cache";
import { prisma, isObjectId, isUniqueViolation } from "@/lib/db";
import {
  deleteBookAndImages,
  deleteCommentThread,
  deleteComments,
  getReportThreshold,
  restoreBook,
  coinsTakenText,
  softRemoveBook,
} from "@/lib/moderation";
import { notify, untilText } from "@/lib/notifications";
import { FEED_TAG } from "@/lib/queries";
import { type CurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { getSiteSettings, setSetting } from "@/lib/settings";
import { findBannedWord, resolveTag, tagKey, validateTagName } from "@/lib/tags";
import { deleteStoredUrls } from "@/lib/storage";
import { deleteUserCompletely } from "@/lib/accounts";
import { COIN_REASON_LABEL, changeCoins, coinTransaction, takeBackBookCoins } from "@/lib/coins";
import { ageFrom } from "@/lib/content";
import { getKidState, notifyParents, syncKidState } from "@/lib/family";
import { ACCOUNT_SWITCHES, GROUP_INFO, RESTRICTIONS } from "@/lib/kids";
import { DEFAULT_THEME, THEMES, findTheme, oldEnoughForTheme } from "@/lib/themes";
import { RATING_AGES, RATING_LABEL, RATINGS, type RatingValue } from "@/lib/content";
import { adminOnlyUsernameError, birthDateSchema, REPORT_REASONS, usernameSchema } from "@/lib/validation";
import { COMMANDS, findCommand, usage, type Cell, type CommandDef, type CommandResult, type ResultBlock } from "./catalog";

class CommandError extends Error {}

const REASON_LABEL: Record<string, string> = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));
const DAY = 24 * 60 * 60_000;
const FOREVER = new Date("9999-12-31T00:00:00Z");

const date = (d: Date) => d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
const bookLink = (b: { id: string; title: string }): Cell => ({ text: b.title, href: `/fanfic/${b.id}` });
const userLink = (username: string): Cell => ({ text: `@${username}`, href: `/u/${username}` });
const duration = (days: number) => `${days} day${days === 1 ? "" : "s"}`;

// ---- Argument resolution ----

const bookSelect = {
  id: true,
  title: true,
  authorId: true,
  removed: true,
  visibility: true,
  author: { select: { username: true } },
} as const;

async function findBook(token: string) {
  const id = token.match(/[a-f0-9]{24}/i)?.[0];
  if (!id) throw new CommandError(`“${token}” isn’t a book link or id.`);
  const book = await prisma.fanfic.findUnique({ where: { id }, select: bookSelect });
  if (!book) throw new CommandError("There’s no book with that id.");
  return book;
}

const userSelect = { id: true, username: true, email: true, role: true, image: true } as const;

async function findUser(token: string) {
  const username = token.replace(/^@/, "").toLowerCase();
  const user = await prisma.user.findUnique({ where: { username }, select: userSelect });
  if (!user) throw new CommandError(`There’s no user called @${username}.`);
  return user;
}

/** The admin account is immune to sanctions. */
function guardAdmin(target: { role: string; email: string | null }, what: string) {
  if (isAdmin(target)) throw new CommandError(`The admin account can’t be ${what}.`);
}

async function findTag(token: string) {
  try {
    const tag = await resolveTag(token);
    if (!tag) throw new CommandError(`There’s no fandom or tag called “${token}”.`);
    return tag;
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError((error as Error).message);
  }
}

function objectIdArg(token: string, what: string) {
  if (!isObjectId(token)) throw new CommandError(`“${token}” isn’t a valid ${what} id.`);
  return token;
}

type Parsed = { def: CommandDef; args: string[]; rest: string };

/** Reads one argument at `i`: a "quoted phrase" (for tag names with spaces) or a single word. */
function readToken(text: string, i: number): { value: string; end: number } | null {
  while (i < text.length && /\s/.test(text[i])) i++;
  if (i >= text.length) return null;
  if (text[i] === '"') {
    const close = text.indexOf('"', i + 1);
    if (close === -1) throw new CommandError("A quote isn’t closed.");
    return { value: text.slice(i + 1, close), end: close + 1 };
  }
  let end = i;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return { value: text.slice(i, end), end };
}

export function parseCommand(input: string): Parsed {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) throw new CommandError("Commands start with “/”. Try /help.");
  const body = trimmed.slice(1);
  const nameToken = readToken(body, 0);
  const def = findCommand(nameToken?.value ?? "");
  if (!def || !nameToken) throw new CommandError(`Unknown command. Try /help.`);

  let at = nameToken.end;
  const args: string[] = [];
  for (const spec of def.args) {
    const token = readToken(body, at);
    if (!token) {
      if (spec.optional) continue;
      throw new CommandError(`Usage: ${usage(def)}`);
    }
    args.push(token.value);
    at = token.end;
  }
  // Free text keeps its spaces; a fully quoted rest loses its quotes.
  const rawRest = body.slice(at).trim();
  const rest = /^"[^"]*"$/.test(rawRest) ? rawRest.slice(1, -1).trim() : rawRest;
  if (def.rest?.required && !rest) throw new CommandError(`Usage: ${usage(def)}`);
  if (!def.rest && rest) throw new CommandError(`Too many arguments. Usage: ${usage(def)}`);
  if (def.rest && rest.length > def.rest.max) throw new CommandError(`The ${def.rest.name} can be at most ${def.rest.max} characters.`);
  return { def, args, rest };
}

function days(token: string, allowForever: boolean): number | "forever" {
  if (allowForever && token.toLowerCase() === "forever") return "forever";
  const n = Number(token);
  if (!Number.isInteger(n) || n < 1 || n > 3650) {
    throw new CommandError(`“${token}” isn’t a number of days (1–3650${allowForever ? ", or forever" : ""}).`);
  }
  return n;
}

// ---- Execution ----

type Ctx = { admin: CurrentUser; input: string };

async function log(ctx: Ctx, action: string, targetType: string, targetId: string | null, targetLabel: string, reason?: string) {
  await prisma.adminLog.create({
    data: { adminId: ctx.admin.id, command: ctx.input.trim().slice(0, 1200), action, targetType, targetId, targetLabel, reason: reason || null },
  });
}

/** Parses and runs one admin command. The caller must have verified the admin. */
export async function runCommand(input: string, ctx: Ctx & { confirmed: boolean }): Promise<CommandResult> {
  try {
    const parsed = parseCommand(input);
    if (parsed.def.destructive && !ctx.confirmed) {
      return { ok: false, needsConfirm: true, message: `Confirm /${parsed.def.name} before it runs.` };
    }
    return await execute(parsed, ctx);
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, message: error.message };
    console.error("admin command failed", error);
    return { ok: false, message: "Something went wrong running that command. Nothing may have changed; check the log." };
  }
}

async function execute({ def, args, rest }: Parsed, ctx: Ctx): Promise<CommandResult> {
  switch (def.name) {
    // ---- Books ----
    case "remove": {
      const book = await findBook(args[0]);
      if (book.removed) throw new CommandError(`“${book.title}” is already removed.`);
      const why = rest || "Removed by the Writt admin.";
      const { coinsTaken } = await softRemoveBook(book.id, why);
      await notify(book.authorId, {
        kind: "BOOK_REMOVED",
        title: `“${book.title}” was removed`,
        body: `The Writt admin removed your book. Reason: ${why}${coinsTakenText(coinsTaken)} If you think this was unfair, you can appeal.`,
        link: `/appeals/new?book=${book.id}`,
      });
      await notifyParents(book.authorId, {
        kind: "FAMILY",
        title: `“${book.title}” was removed`,
        body: `The Writt admin removed your child’s book “${book.title}”. Reason: ${why}${coinsTakenText(coinsTaken)}`,
      });
      await log(ctx, "remove", "book", book.id, book.title, rest);
      updateTag(FEED_TAG);
      return { ok: true, message: `“${book.title}” by @${book.author.username} is removed.` };
    }
    case "restore": {
      const book = await findBook(args[0]);
      if (!book.removed) throw new CommandError(`“${book.title}” isn’t removed.`);
      const { coinsBack } = await restoreBook(book.id);
      await notify(book.authorId, {
        kind: "BOOK_RESTORED",
        title: `“${book.title}” is back`,
        body: `The Writt admin restored your book.${coinsBack ? ` Your ${coinsBack} coins are back too.` : ""}`,
        link: `/fanfic/${book.id}`,
      });
      await log(ctx, "restore", "book", book.id, book.title);
      updateTag(FEED_TAG);
      return { ok: true, message: `“${book.title}” is restored.` };
    }
    case "delete": {
      const book = await findBook(args[0]);
      // Deleting by the admin is the strongest removal: the coins the book earned go too.
      const coinsTaken = book.removed ? 0 : await takeBackBookCoins(book.id);
      await deleteBookAndImages(book.id);
      await notify(book.authorId, {
        kind: "BOOK_REMOVED",
        title: `“${book.title}” was deleted`,
        body: `The Writt admin permanently deleted your book.${coinsTakenText(coinsTaken)}`,
      });
      await notifyParents(book.authorId, {
        kind: "FAMILY",
        title: `“${book.title}” was deleted`,
        body: `The Writt admin permanently deleted your child’s book “${book.title}”.${coinsTakenText(coinsTaken)}`,
      });
      await log(ctx, "delete", "book", book.id, book.title);
      updateTag(FEED_TAG);
      return { ok: true, message: `“${book.title}” is permanently deleted, with its images.` };
    }
    case "feature":
    case "unfeature": {
      const book = await findBook(args[0]);
      const on = def.name === "feature";
      if (on && (book.removed || book.visibility !== "PUBLIC")) throw new CommandError("Only public, non-removed books can be featured.");
      await prisma.fanfic.update({ where: { id: book.id }, data: { featured: on, featuredAt: on ? new Date() : null } });
      await log(ctx, def.name, "book", book.id, book.title);
      updateTag(FEED_TAG);
      return { ok: true, message: on ? `“${book.title}” is featured on the homepage.` : `“${book.title}” is no longer featured.` };
    }
    case "hot":
    case "unhot": {
      const book = await findBook(args[0]);
      await prisma.fanfic.update({ where: { id: book.id }, data: { hotMode: def.name === "hot" ? "ON" : "OFF" } });
      await log(ctx, def.name, "book", book.id, book.title);
      updateTag(FEED_TAG);
      return { ok: true, message: def.name === "hot" ? `“${book.title}” is labeled Hot.` : `“${book.title}” won’t be labeled Hot.` };
    }
    case "setrating": {
      const book = await findBook(args[0]);
      const rating = rest.trim().toUpperCase() as RatingValue;
      if (!RATINGS.some((r) => r.value === rating)) throw new CommandError("Use everyone, teen or mature.");
      const label = `${RATING_LABEL[rating]} (${RATING_AGES[rating]})`;
      await prisma.fanfic.update({ where: { id: book.id }, data: { rating } });
      await notify(book.authorId, {
        kind: "RATING_CHANGED",
        title: "Your book’s age range was changed",
        body: `The Writt admin marked “${book.title}” as ${label}.`,
        link: `/fanfic/${book.id}`,
      });
      await log(ctx, "setrating", "book", book.id, `${book.title} → ${label}`);
      updateTag(FEED_TAG);
      return { ok: true, message: `“${book.title}” is now ${label}.` };
    }
    case "hide": {
      const book = await findBook(args[0]);
      await prisma.fanfic.update({ where: { id: book.id }, data: { visibility: "PRIVATE", featured: false } });
      await log(ctx, "hide", "book", book.id, book.title);
      updateTag(FEED_TAG);
      return { ok: true, message: `“${book.title}” is now private; only @${book.author.username} can see it.` };
    }

    // ---- Reports ----
    case "reports": {
      if (args[0]) {
        const book = await findBook(args[0]);
        const reports = await prisma.report.findMany({
          where: { fanficId: book.id },
          orderBy: { createdAt: "desc" },
          select: { reason: true, details: true, status: true, createdAt: true, reporter: { select: { username: true } } },
        });
        return {
          ok: true,
          message: `${reports.length} report${reports.length === 1 ? "" : "s"} on “${book.title}”.`,
          blocks: reports.length
            ? [{
                kind: "table",
                columns: ["Reporter", "Reason", "Details", "Status", "When"],
                rows: reports.map((r) => [userLink(r.reporter.username), REASON_LABEL[r.reason], r.details ?? "", r.status.toLowerCase(), date(r.createdAt)]),
              }]
            : [],
        };
      }
      const grouped = await prisma.report.groupBy({ by: ["fanficId"], _count: { _all: true } });
      const top = grouped.sort((a, b) => b._count._all - a._count._all).slice(0, 20);
      const [books, reports] = await Promise.all([
        prisma.fanfic.findMany({ where: { id: { in: top.map((t) => t.fanficId) } }, select: { id: true, title: true, removed: true } }),
        prisma.report.findMany({
          where: { fanficId: { in: top.map((t) => t.fanficId) } },
          select: { fanficId: true, reason: true, reporter: { select: { username: true } } },
        }),
      ]);
      const rows: Cell[][] = top.map((t) => {
        const book = books.find((b) => b.id === t.fanficId);
        const mine = reports.filter((r) => r.fanficId === t.fanficId);
        const reasons = Object.entries(
          mine.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] ?? 0) + 1 }), {}),
        )
          .sort((a, b) => b[1] - a[1])
          .map(([reason, n]) => `${REASON_LABEL[reason]} ×${n}`)
          .join(", ");
        const reporters = mine.slice(0, 5).map((r) => `@${r.reporter.username}`).join(", ") + (mine.length > 5 ? ` +${mine.length - 5}` : "");
        return [
          book ? bookLink(book) : t.fanficId,
          String(t._count._all),
          book?.removed ? "removed" : "live",
          reasons,
          reporters,
        ];
      });
      return {
        ok: true,
        message: rows.length ? `Most-reported books (removal at ${await getReportThreshold()} reports).` : "No reports yet.",
        blocks: rows.length ? [{ kind: "table", columns: ["Book", "Reports", "State", "Reasons", "Reported by"], rows }] : [],
      };
    }
    case "clearreports": {
      const book = await findBook(args[0]);
      const { count } = await prisma.report.deleteMany({ where: { fanficId: book.id } });
      await log(ctx, "clearreports", "book", book.id, book.title);
      return { ok: true, message: `Deleted ${count} report${count === 1 ? "" : "s"} on “${book.title}”.` };
    }
    case "threshold": {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 20 || n > 25) throw new CommandError("The threshold must be a whole number from 20 to 25.");
      await setSetting("reportThreshold", n);
      await log(ctx, "threshold", "site", null, `report threshold ${n}`);
      return { ok: true, message: `Books are now removed at ${n} reports.` };
    }

    // ---- Appeals ----
    case "appeals": {
      const appeals = await prisma.appeal.findMany({
        where: { status: "OPEN" },
        orderBy: { createdAt: "asc" },
        select: { id: true, bookTitle: true, fanficId: true, createdAt: true, awaitingAdmin: true, user: { select: { username: true } } },
      });
      return {
        ok: true,
        message: appeals.length ? `${appeals.length} open appeal${appeals.length === 1 ? "" : "s"}, oldest first.` : "No open appeals.",
        blocks: appeals.length
          ? [{
              kind: "table",
              columns: ["Appeal", "Book", "From", "Sent", "Waiting on"],
              rows: appeals.map((a) => [
                { text: a.id, href: `/admin?tab=appeals&id=${a.id}` },
                bookLink({ id: a.fanficId, title: a.bookTitle }),
                userLink(a.user.username),
                date(a.createdAt),
                a.awaitingAdmin ? "you" : "them",
              ]),
            }]
          : [],
      };
    }
    case "appeal": {
      const appeal = await loadAppeal(args[0]);
      const reports = await prisma.report.findMany({
        where: { fanficId: appeal.fanficId },
        select: { reason: true, details: true, reporter: { select: { username: true } } },
      });
      const blocks: ResultBlock[] = [
        {
          kind: "fields",
          items: [
            ["Status", appeal.status.toLowerCase()],
            ["From", userLink(appeal.user.username)],
            ["Book", bookLink({ id: appeal.fanficId, title: appeal.bookTitle })],
            ["Author", appeal.fanfic ? userLink(appeal.fanfic.author.username) : "—"],
            ["Removed", appeal.fanfic?.removed ? (appeal.fanfic.removedReason ?? "yes") : "no (live)"],
            ["Sent", date(appeal.createdAt)],
            ...(appeal.decision ? ([["Decision note", appeal.decision]] as [string, Cell][]) : []),
          ],
        },
        {
          kind: "thread",
          messages: [
            { from: `@${appeal.user.username}`, admin: false, at: date(appeal.createdAt), body: appeal.message },
            ...appeal.messages.map((m) => ({
              from: m.fromAdmin ? "Admin" : `@${appeal.user.username}`,
              admin: m.fromAdmin,
              at: date(m.createdAt),
              body: m.body,
            })),
          ],
        },
      ];
      if (reports.length) {
        blocks.push({
          kind: "table",
          columns: ["Reporter", "Reason", "Details"],
          rows: reports.map((r) => [userLink(r.reporter.username), REASON_LABEL[r.reason], r.details ?? ""]),
        });
      }
      return { ok: true, message: `Appeal ${appeal.id} about “${appeal.bookTitle}”.`, blocks };
    }
    case "reply": {
      const appeal = await loadAppeal(args[0], true);
      await prisma.$transaction([
        prisma.appealMessage.create({ data: { appealId: appeal.id, authorId: ctx.admin.id, fromAdmin: true, body: rest } }),
        prisma.appeal.update({ where: { id: appeal.id }, data: { awaitingAdmin: false } }),
      ]);
      await notify(appeal.userId, {
        kind: "APPEAL_REPLY",
        title: "The admin replied to your appeal",
        body: `About “${appeal.bookTitle}”: ${rest.slice(0, 200)}`,
        link: `/appeals/${appeal.id}`,
      });
      await log(ctx, "reply", "appeal", appeal.id, appeal.bookTitle, rest);
      return { ok: true, message: `Reply sent to @${appeal.user.username}.` };
    }
    case "approve": {
      const appeal = await loadAppeal(args[0], true);
      const coinsBack = appeal.fanfic?.removed ? (await restoreBook(appeal.fanficId)).coinsBack : 0;
      await prisma.report.deleteMany({ where: { fanficId: appeal.fanficId } });
      let liftedBlock = false;
      if (appeal.fanfic) {
        const author = await prisma.user.findUnique({
          where: { id: appeal.fanfic.authorId },
          select: { createBlockedUntil: true, createBlockKind: true },
        });
        if (author?.createBlockKind === "REPORTS" && author.createBlockedUntil && author.createBlockedUntil > new Date()) {
          await prisma.user.update({
            where: { id: appeal.fanfic.authorId },
            data: { createBlockedUntil: null, createBlockReason: null, createBlockKind: null },
          });
          liftedBlock = true;
        }
      }
      await closeAppeal(appeal.id, "APPROVED", rest, ctx);
      await notify(appeal.userId, {
        kind: "APPEAL_APPROVED",
        title: "Your appeal was approved",
        body: `“${appeal.bookTitle}” is back on Writt.${coinsBack ? ` Your ${coinsBack} coins are back too.` : ""}${rest ? ` Admin: ${rest}` : ""}`,
        link: `/appeals/${appeal.id}`,
      });
      if (appeal.fanfic && appeal.fanfic.authorId !== appeal.userId) {
        await notify(appeal.fanfic.authorId, {
          kind: "BOOK_RESTORED",
          title: `“${appeal.bookTitle}” is back`,
          body: "Your book was restored after an appeal.",
          link: `/fanfic/${appeal.fanficId}`,
        });
      }
      await log(ctx, "approve", "appeal", appeal.id, appeal.bookTitle, rest);
      updateTag(FEED_TAG);
      return {
        ok: true,
        message: `Approved. “${appeal.bookTitle}” is restored, its reports are cleared${liftedBlock ? " and the author’s 14-day block is lifted" : ""}.`,
      };
    }
    case "deny": {
      const appeal = await loadAppeal(args[0], true);
      await closeAppeal(appeal.id, "DENIED", rest, ctx);
      await notify(appeal.userId, {
        kind: "APPEAL_DENIED",
        title: "Your appeal was denied",
        body: `“${appeal.bookTitle}” stays removed.${rest ? ` Reason: ${rest}` : ""}`,
        link: `/appeals/${appeal.id}`,
      });
      await log(ctx, "deny", "appeal", appeal.id, appeal.bookTitle, rest);
      return { ok: true, message: `Denied. “${appeal.bookTitle}” stays removed.` };
    }

    // ---- Users ----
    case "lookup":
      return lookup(await findUser(args[0]));
    case "ban": {
      const target = await findUser(args[0]);
      guardAdmin(target, "banned");
      const d = days(args[1], true);
      const until = d === "forever" ? FOREVER : new Date(Date.now() + d * DAY);
      await prisma.user.update({ where: { id: target.id }, data: { bannedUntil: until, banReason: rest || null } });
      await notify(target.id, {
        kind: "BANNED",
        title: "Your account was banned",
        body: `You can’t log in ${untilText(until)}.${rest ? ` Reason: ${rest}` : ""}`,
      });
      await notifyParents(target.id, {
        kind: "FAMILY",
        title: `${target.username} was banned`,
        body: `The Writt admin banned ${target.username} ${untilText(until)}.${rest ? ` Reason: ${rest}` : ""}`,
      });
      await log(ctx, "ban", "user", target.id, `@${target.username}`, [d === "forever" ? "forever" : duration(d), rest].filter(Boolean).join(" · "));
      return { ok: true, message: d === "forever" ? `@${target.username} is banned forever.` : `@${target.username} is banned for ${duration(d)}.` };
    }
    case "unban": {
      const target = await findUser(args[0]);
      await prisma.user.update({ where: { id: target.id }, data: { bannedUntil: null, banReason: null } });
      await log(ctx, "unban", "user", target.id, `@${target.username}`);
      return { ok: true, message: `@${target.username} is no longer banned.` };
    }
    case "block": {
      const target = await findUser(args[0]);
      guardAdmin(target, "blocked");
      const d = days(args[1], false) as number;
      const until = new Date(Date.now() + d * DAY);
      await prisma.user.update({
        where: { id: target.id },
        data: { createBlockedUntil: until, createBlockReason: rest || "Blocked by the Writt admin.", createBlockKind: "ADMIN" },
      });
      await notify(target.id, {
        kind: "BLOCKED",
        title: "You can’t create new books for now",
        body: `The admin paused your book creation ${untilText(until)}.${rest ? ` Reason: ${rest}` : ""}`,
      });
      await notifyParents(target.id, {
        kind: "FAMILY",
        title: `${target.username} can’t create books for now`,
        body: `The Writt admin blocked ${target.username} from creating books ${untilText(until)}.${rest ? ` Reason: ${rest}` : ""}`,
      });
      await log(ctx, "block", "user", target.id, `@${target.username}`, [duration(d), rest].filter(Boolean).join(" · "));
      return { ok: true, message: `@${target.username} can’t create books for ${duration(d)}.` };
    }
    case "unblock": {
      const target = await findUser(args[0]);
      await prisma.user.update({
        where: { id: target.id },
        data: { createBlockedUntil: null, createBlockReason: null, createBlockKind: null },
      });
      await log(ctx, "unblock", "user", target.id, `@${target.username}`);
      return { ok: true, message: `@${target.username} can create books again.` };
    }
    case "mute": {
      const target = await findUser(args[0]);
      guardAdmin(target, "muted");
      const d = days(args[1], false) as number;
      const until = new Date(Date.now() + d * DAY);
      await prisma.user.update({ where: { id: target.id }, data: { mutedUntil: until } });
      await notify(target.id, {
        kind: "MUTED",
        title: "You’ve been muted",
        body: `You can’t comment ${untilText(until)}.${rest ? ` Reason: ${rest}` : ""}`,
      });
      await log(ctx, "mute", "user", target.id, `@${target.username}`, [duration(d), rest].filter(Boolean).join(" · "));
      return { ok: true, message: `@${target.username} is muted for ${duration(d)}.` };
    }
    case "unmute": {
      const target = await findUser(args[0]);
      await prisma.user.update({ where: { id: target.id }, data: { mutedUntil: null } });
      await log(ctx, "unmute", "user", target.id, `@${target.username}`);
      return { ok: true, message: `@${target.username} can comment again.` };
    }
    case "warn": {
      const target = await findUser(args[0]);
      guardAdmin(target, "warned");
      await notify(target.id, { kind: "WARNING", title: "A warning from the Writt admin", body: rest });
      await notifyParents(target.id, { kind: "FAMILY", title: `${target.username} got a warning`, body: `The Writt admin sent ${target.username} a warning: ${rest}` });
      await log(ctx, "warn", "user", target.id, `@${target.username}`, rest);
      return { ok: true, message: `Warning sent to @${target.username}. They’ll see it next time they open Writt.` };
    }
    case "resetpfp": {
      const target = await findUser(args[0]);
      await prisma.user.update({ where: { id: target.id }, data: { image: null } });
      if (target.image) await deleteStoredUrls([target.image]);
      await log(ctx, "resetpfp", "user", target.id, `@${target.username}`);
      return { ok: true, message: `@${target.username}’s profile picture is removed.` };
    }
    case "setbirthdate": {
      const target = await findUser(args[0]);
      guardAdmin(target, "changed this way");
      const parsed = birthDateSchema.safeParse(rest.trim());
      if (!parsed.success) throw new CommandError(parsed.error.issues[0].message);
      await prisma.user.update({ where: { id: target.id }, data: { birthDate: parsed.data } });
      // Family rules follow the new date: under 16 needs a parent, 16+ is free of restrictions.
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { id: true, username: true, birthDate: true, consent: true, kidGroup: true },
      });
      const consent = await syncKidState(after);
      await notify(target.id, {
        kind: "BIRTHDATE_CHANGED",
        title: "Your date of birth was updated",
        body: "The Writt admin corrected your date of birth. It decides which books you can see.",
        link: "/settings",
      });
      // The date itself isn't logged: it's private.
      await log(ctx, "setbirthdate", "user", target.id, `@${target.username}`);
      const note =
        consent === "PENDING" ? " They’re under 16 without a parent’s permission, so the account is locked until a parent approves." : "";
      return { ok: true, message: `@${target.username}’s date of birth is updated.${note}` };
    }

    // ---- Families ----
    case "family":
      return familyInfo(await findUser(args[0]), ctx);
    case "families":
      return familiesList(ctx);

    // ---- Coins ----
    case "coins": {
      const target = await findUser(args[0]);
      const [balance, history] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { coins: true } }),
        prisma.coinTransaction.findMany({
          where: { userId: target.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { amount: true, reason: true, note: true, createdAt: true },
        }),
      ]);
      await log(ctx, "coins", "user", target.id, `@${target.username}`);
      return {
        ok: true,
        message: isAdmin(target) ? `@${target.username} has unlimited coins (∞).` : `@${target.username} has ${balance.coins} coins.`,
        blocks: [
          history.length
            ? {
                kind: "table",
                columns: ["When", "Coins", "What"],
                rows: history.map((h) => [date(h.createdAt), h.amount > 0 ? `+${h.amount}` : String(h.amount), `${COIN_REASON_LABEL[h.reason]}${h.note ? `: ${h.note}` : ""}`]),
              }
            : { kind: "text", text: "No coin history." },
        ],
      };
    }
    case "givecoins":
    case "takecoins": {
      const target = await findUser(args[0]);
      const amount = coinAmount(args[1]);
      const give = def.name === "givecoins";
      const moved = await coinTransaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: target.id }, select: { coins: true } });
        const change = give ? amount : -Math.min(amount, user.coins);
        if (change !== 0) await changeCoins(tx, target.id, change, give ? "ADMIN_GIVE" : "ADMIN_TAKE", { note: rest || null });
        return Math.abs(change);
      });
      if (moved > 0) {
        await notify(target.id, {
          kind: "COINS",
          title: give ? `+${moved} coins from the admin` : `The admin took ${moved} coins`,
          body: rest || (give ? "A gift from the Writt admin." : "The Writt admin adjusted your coins."),
          link: "/shop",
        });
      }
      await log(ctx, def.name, "user", target.id, `@${target.username}`, [`${moved} coins`, rest].filter(Boolean).join(" · "));
      const now = await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { coins: true } });
      if (!give && moved < amount) {
        return { ok: true, message: `Took ${moved} coins from @${target.username} (all they had). They have 0 now.` };
      }
      return { ok: true, message: `${give ? "Gave" : "Took"} ${moved} coins ${give ? "to" : "from"} @${target.username}. They have ${now.coins} now.` };
    }
    case "themeprice": {
      const theme = findTheme(args[0]);
      if (!theme || theme.id === DEFAULT_THEME) throw new CommandError(`“${args[0]}” isn’t a theme you can sell. Themes: ${THEMES.filter((t) => t.id !== DEFAULT_THEME).map((t) => t.id).join(", ")}.`);
      const price = coinAmount(args[1], true);
      const { themePrices } = await getSiteSettings();
      await setSetting("themePrices", { ...themePrices, [theme.id]: price });
      await log(ctx, "themeprice", "theme", null, theme.name, `${price} coins`);
      return { ok: true, message: `${theme.name} now costs ${price} coins.` };
    }
    case "givetheme": {
      const target = await findUser(args[0]);
      const theme = findTheme(args[1]);
      if (!theme || theme.id === DEFAULT_THEME) throw new CommandError(`“${args[1]}” isn’t a theme. Themes: ${THEMES.filter((t) => t.id !== DEFAULT_THEME).map((t) => t.id).join(", ")}.`);
      const owner = await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { birthDate: true } });
      if (!oldEnoughForTheme(theme, ageFrom(owner.birthDate))) {
        throw new CommandError(`@${target.username} is under ${theme.minAge}, so they can’t have ${theme.name}.`);
      }
      try {
        await prisma.themeOwnership.create({ data: { userId: target.id, theme: theme.id, source: "GIFT" } });
      } catch (error) {
        if (isUniqueViolation(error)) throw new CommandError(`@${target.username} already owns ${theme.name}.`);
        throw error;
      }
      await notify(target.id, { kind: "COINS", title: `You got the ${theme.name} theme!`, body: "A gift from the Writt admin. Use it from My themes in the shop.", link: "/shop?tab=mine" });
      await log(ctx, "givetheme", "user", target.id, `@${target.username}`, theme.name);
      return { ok: true, message: `@${target.username} now owns ${theme.name}.` };
    }
    case "rename": {
      const target = await findUser(args[0]);
      guardAdmin(target, "renamed");
      const parsed = usernameSchema.safeParse(rest);
      if (!parsed.success) throw new CommandError(parsed.error.issues[0].message);
      const reserved = adminOnlyUsernameError(parsed.data, false);
      if (reserved) throw new CommandError(reserved);
      try {
        await prisma.user.update({ where: { id: target.id }, data: { username: parsed.data } });
      } catch (error) {
        if (isUniqueViolation(error)) throw new CommandError(`@${parsed.data} is already taken.`);
        throw error;
      }
      await notify(target.id, {
        kind: "RENAMED",
        title: "Your username was changed",
        body: `The Writt admin changed your username from @${target.username} to @${parsed.data}.`,
        link: `/u/${parsed.data}`,
      });
      await log(ctx, "rename", "user", target.id, `@${target.username} → @${parsed.data}`);
      updateTag(FEED_TAG);
      return { ok: true, message: `@${target.username} is now @${parsed.data}.` };
    }
    case "deleteuser": {
      const target = await findUser(args[0]);
      guardAdmin(target, "deleted");
      await deleteUserCompletely(target.id);
      await log(ctx, "deleteuser", "user", target.id, `@${target.username}`);
      updateTag(FEED_TAG);
      return { ok: true, message: `@${target.username} and everything they posted are permanently deleted.` };
    }

    // ---- Comments ----
    case "deletecomment": {
      const id = objectIdArg(args[0], "comment");
      const comment = await prisma.comment.findUnique({
        where: { id },
        select: { fanficId: true, body: true, author: { select: { username: true } } },
      });
      if (!comment) throw new CommandError("There’s no comment with that id.");
      const removed = await deleteCommentThread(id, comment.fanficId);
      await log(ctx, "deletecomment", "comment", id, `@${comment.author.username}: ${comment.body.slice(0, 80)}`);
      return { ok: true, message: `Deleted @${comment.author.username}’s comment${removed > 1 ? ` and ${removed - 1} repl${removed === 2 ? "y" : "ies"}` : ""}.` };
    }
    case "clearcomments": {
      const book = await findBook(args[0]);
      const count = (await prisma.$transaction((tx) => deleteComments(tx, { fanficId: book.id }))).length;
      await prisma.fanfic.update({ where: { id: book.id }, data: { commentCount: 0 } });
      await log(ctx, "clearcomments", "book", book.id, book.title);
      return { ok: true, message: `Deleted ${count} comment${count === 1 ? "" : "s"} on “${book.title}”.` };
    }
    case "lockcomments":
    case "unlockcomments": {
      const book = await findBook(args[0]);
      const lock = def.name === "lockcomments";
      await prisma.fanfic.update({ where: { id: book.id }, data: { commentsLocked: lock } });
      await log(ctx, def.name, "book", book.id, book.title);
      return { ok: true, message: lock ? `Comments on “${book.title}” are off.` : `Comments on “${book.title}” are on again.` };
    }

    // ---- Tags ----
    case "tags": {
      const tags = await prisma.tag.findMany({
        orderBy: { createdAt: "desc" },
        take: 300,
        select: { id: true, name: true, kind: true, createdAt: true, createdBy: { select: { username: true } }, _count: { select: { books: true } } },
      });
      return {
        ok: true,
        message: tags.length ? `${tags.length} fandoms and tags, newest first.` : "No fandoms or tags yet.",
        blocks: tags.length
          ? [{
              kind: "table",
              columns: ["Name", "Type", "Created by", "Books", "Created", "Id"],
              rows: tags.map((t) => [
                { text: t.name, href: `/t/${t.id}` },
                t.kind === "FANDOM" ? "fandom" : "tag",
                t.createdBy ? userLink(t.createdBy.username) : "—",
                String(t._count.books),
                date(t.createdAt),
                t.id,
              ]),
            }]
          : [],
      };
    }
    case "renametag": {
      const tag = await findTag(args[0]);
      const valid = await validateTagName(rest);
      if (!valid.ok) throw new CommandError(valid.error);
      const key = tagKey(valid.name);
      const clash = await prisma.tag.findUnique({ where: { kind_key: { kind: tag.kind, key } }, select: { id: true } });
      if (clash && clash.id !== tag.id) throw new CommandError(`“${valid.name}” already exists. Use /mergetag to combine them.`);
      await prisma.tag.update({ where: { id: tag.id }, data: { name: valid.name, key } });
      await log(ctx, "renametag", "tag", tag.id, `${tag.name} → ${valid.name}`);
      updateTag(FEED_TAG);
      return { ok: true, message: `“${tag.name}” is now “${valid.name}” on every book.` };
    }
    case "mergetag": {
      const from = await findTag(args[0]);
      const into = await findTag(rest);
      if (from.id === into.id) throw new CommandError("Those are the same tag.");
      if (from.kind !== into.kind) throw new CommandError("You can only merge a fandom into a fandom, or a tag into a tag.");
      const [fromLinks, intoLinks] = await Promise.all([
        prisma.bookTag.findMany({ where: { tagId: from.id }, select: { fanficId: true } }),
        prisma.bookTag.findMany({ where: { tagId: into.id }, select: { fanficId: true } }),
      ]);
      const already = new Set(intoLinks.map((l) => l.fanficId));
      const moving = fromLinks.filter((l) => !already.has(l.fanficId));
      await prisma.$transaction([
        ...(moving.length ? [prisma.bookTag.createMany({ data: moving.map((l) => ({ fanficId: l.fanficId, tagId: into.id })) })] : []),
        prisma.bookTag.deleteMany({ where: { tagId: from.id } }),
        prisma.tag.delete({ where: { id: from.id } }),
      ]);
      await log(ctx, "mergetag", "tag", into.id, `${from.name} → ${into.name}`);
      updateTag(FEED_TAG);
      return { ok: true, message: `Merged “${from.name}” into “${into.name}”: ${fromLinks.length} book${fromLinks.length === 1 ? "" : "s"} moved.` };
    }
    case "deletetag": {
      const tag = await findTag(args[0]);
      const { count } = await prisma.bookTag.deleteMany({ where: { tagId: tag.id } });
      await prisma.tag.delete({ where: { id: tag.id } });
      await log(ctx, "deletetag", "tag", tag.id, tag.name);
      updateTag(FEED_TAG);
      return { ok: true, message: `Deleted “${tag.name}” and removed it from ${count} book${count === 1 ? "" : "s"}.` };
    }
    case "bantag": {
      const word = rest.trim().toLowerCase().replace(/\s+/g, " ");
      if (!/^[\p{L}\p{N} ]{1,40}$/u.test(word)) throw new CommandError("Banned words can only use letters, numbers and spaces.");
      const current = (await getSiteSettings()).bannedTagWords;
      if (!current.includes(word)) await setSetting("bannedTagWords", [...current, word]);
      const existing = (await prisma.tag.findMany({ select: { id: true, name: true, kind: true } })).filter((t) => findBannedWord(t.name, [word]));
      await log(ctx, "bantag", "site", null, `banned tag word “${word}”`);
      return {
        ok: true,
        message: `No new tag can contain “${word}”.${existing.length ? ` ${existing.length} existing tag${existing.length === 1 ? "" : "s"} already contain it: rename, merge or delete them.` : ""}`,
        blocks: existing.length
          ? [{ kind: "table", columns: ["Tag", "Type", "Id"], rows: existing.map((t) => [{ text: t.name, href: `/t/${t.id}` }, t.kind.toLowerCase(), t.id]) }]
          : [],
      };
    }

    // ---- Site ----
    case "announce":
      await setSetting("announcement", rest);
      await log(ctx, "announce", "site", null, "announcement", rest);
      return { ok: true, message: "The announcement banner is live for everyone." };
    case "unannounce":
      await setSetting("announcement", null);
      await log(ctx, "unannounce", "site", null, "announcement");
      return { ok: true, message: "The announcement banner is removed." };
    case "maintenance": {
      const on = args[0].toLowerCase();
      if (on !== "on" && on !== "off") throw new CommandError("Use /maintenance on or /maintenance off.");
      await setSetting("maintenance", on === "on");
      await log(ctx, `maintenance ${on}`, "site", null, "maintenance mode");
      return { ok: true, message: on === "on" ? "Maintenance mode is on. Everyone but you sees the maintenance page." : "Maintenance mode is off. Writt is open again." };
    }
    case "stats":
      return stats();
    case "help":
      return help();
  }
  throw new CommandError("Unknown command. Try /help.");
}

// ---- Helpers for bigger commands ----

async function loadAppeal(token: string, mustBeOpen = false) {
  const id = objectIdArg(token, "appeal");
  const appeal = await prisma.appeal.findUnique({
    where: { id },
    include: {
      user: { select: { username: true } },
      fanfic: { select: { authorId: true, removed: true, removedReason: true, author: { select: { username: true } } } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!appeal) throw new CommandError("There’s no appeal with that id.");
  if (mustBeOpen && appeal.status !== "OPEN") throw new CommandError(`That appeal is already ${appeal.status.toLowerCase()}.`);
  return appeal;
}

async function closeAppeal(id: string, status: "APPROVED" | "DENIED", note: string, ctx: Ctx) {
  await prisma.appeal.update({
    where: { id },
    data: { status, decision: note || null, closedAt: new Date(), awaitingAdmin: false },
  });
  if (note) {
    await prisma.appealMessage.create({ data: { appealId: id, authorId: ctx.admin.id, fromAdmin: true, body: note } });
  }
}

async function lookup(target: Awaited<ReturnType<typeof findUser>>): Promise<CommandResult> {
  const [user, books, reportsMade, reportsReceived, appeals, history] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      select: {
        email: true,
        nickname: true,
        createdAt: true,
        role: true,
        bannedUntil: true,
        banReason: true,
        mutedUntil: true,
        createBlockedUntil: true,
        createBlockReason: true,
      },
    }),
    prisma.fanfic.findMany({
      where: { authorId: target.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, visibility: true, removed: true, views: true, _count: { select: { reports: true } } },
    }),
    prisma.report.count({ where: { reporterId: target.id } }),
    prisma.report.count({ where: { fanfic: { authorId: target.id } } }),
    prisma.appeal.findMany({ where: { userId: target.id }, select: { id: true, bookTitle: true, status: true } }),
    prisma.adminLog.findMany({
      where: { targetType: "user", targetId: target.id, action: { in: ["ban", "unban", "block", "unblock", "mute", "unmute", "warn"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const now = new Date();
  const active = (d: Date | null) => (d && d > now ? untilText(d) : "no");
  const count = (v: "PUBLIC" | "PRIVATE" | "DRAFT") => books.filter((b) => b.visibility === v && !b.removed).length;

  const blocks: ResultBlock[] = [
    {
      kind: "fields",
      items: [
        ["Username", userLink(target.username)],
        ["Nickname", user.nickname ?? "—"],
        ["Email", user.email ?? "—"],
        ["Joined", date(user.createdAt)],
        ["Role", user.role.toLowerCase()],
        ["Banned", user.bannedUntil && user.bannedUntil > now ? `${untilText(user.bannedUntil)}${user.banReason ? ` (${user.banReason})` : ""}` : "no"],
        ["Muted", active(user.mutedUntil)],
        ["Create block", user.createBlockedUntil && user.createBlockedUntil > now ? `${untilText(user.createBlockedUntil)}` : "no"],
        ["Books", `${count("PUBLIC")} public · ${count("PRIVATE")} private · ${count("DRAFT")} drafts · ${books.filter((b) => b.removed).length} removed`],
        ["Reports made", String(reportsMade)],
        ["Reports received", String(reportsReceived)],
        ["Appeals", appeals.length ? appeals.map((a) => `${a.bookTitle} (${a.status.toLowerCase()})`).join(", ") : "none"],
      ],
    },
  ];
  if (books.length) {
    blocks.push({
      kind: "table",
      columns: ["Book", "State", "Views", "Reports"],
      rows: books.map((b) => [bookLink(b), b.removed ? "removed" : b.visibility.toLowerCase(), String(b.views), String(b._count.reports)]),
    });
  }
  blocks.push(
    history.length
      ? {
          kind: "table",
          columns: ["When", "Action", "Details"],
          rows: history.map((h) => [date(h.createdAt), h.action, h.reason ?? ""]),
        }
      : { kind: "text", text: "No ban, block, mute or warning history." },
  );
  return { ok: true, message: `@${target.username}`, blocks };
}

/** A whole number of coins, 1 to 100000 (0 allowed for prices). */
function coinAmount(token: string, allowZero = false): number {
  const n = Number(token);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1) || n > 100_000) {
    throw new CommandError(`“${token}” isn’t a number of coins (${allowZero ? 0 : 1}–100000).`);
  }
  return n;
}

/** /family: a child's parent, consent, age group and restrictions, or a parent's children. Never shows contact details. */
async function familyInfo(target: { id: string; username: string }, ctx: Ctx): Promise<CommandResult> {
  const [user, link, children, records, request, kid] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { kind: true, birthDate: true, consent: true, paused: true, consentDeadline: true } }),
    prisma.familyLink.findUnique({ where: { childId: target.id }, select: { createdAt: true, parent: { select: { username: true, kind: true } } } }),
    prisma.familyLink.findMany({ where: { parentId: target.id }, select: { child: { select: { username: true, birthDate: true, consent: true } } } }),
    prisma.consentRecord.findMany({ where: { childId: target.id }, orderBy: { grantedAt: "desc" }, take: 5, select: { method: true, grantedAt: true, revokedAt: true } }),
    prisma.consentRequest.findUnique({ where: { childId: target.id }, select: { method: true, sentAt: true, expiresAt: true } }),
    getKidState(target.id),
  ]);
  await log(ctx, "family", "user", target.id, `@${target.username}`);
  const blocks: ResultBlock[] = [];
  const age = ageFrom(user.birthDate);
  blocks.push({
    kind: "fields",
    items: [
      ["Account", user.kind === "FAMILY" ? "Family account (parent only)" : "Writer"],
      ["Age", age === null ? "unknown" : String(age)],
      ["Age group", kid ? `${GROUP_INFO[kid.group].label} (${GROUP_INFO[kid.group].ages})` : "none (16+, no restrictions)"],
      ["Consent", user.consent.toLowerCase().replace("_", " ")],
      ["Paused", user.paused ? "yes" : "no"],
      ["Parent", link ? `@${link.parent.username}${link.parent.kind === "FAMILY" ? " (family account)" : ""}, linked ${date(link.createdAt)}` : "none"],
    ],
  });
  if (request) {
    blocks.push({ kind: "text", text: `Waiting for a parent: ${request.method === "EMAIL" ? "email" : "text"} sent ${date(request.sentAt)}, expires ${date(request.expiresAt)}.` });
  }
  if (records.length) {
    blocks.push({
      kind: "table",
      columns: ["Consent given", "Method", "Removed"],
      rows: records.map((r) => [date(r.grantedAt), r.method === "EMAIL" ? "email link" : "text code", r.revokedAt ? date(r.revokedAt) : ""]),
    });
  }
  if (kid) {
    blocks.push({
      kind: "table",
      columns: ["Restriction", "State", "Set by"],
      rows: [...RESTRICTIONS, ...ACCOUNT_SWITCHES].map((r) => [r.label, kid.controls[r.key] ? "on" : "off", r.key in kid.overrides ? "parent" : "age-group default"]),
    });
  }
  if (children.length) {
    blocks.push({
      kind: "table",
      columns: ["Child", "Age", "Consent"],
      rows: children.map((c) => [userLink(c.child.username), String(ageFrom(c.child.birthDate) ?? "?"), c.child.consent.toLowerCase()]),
    });
  }
  return { ok: true, message: `@${target.username}`, blocks };
}

/** /families: every parent with their children, and kids' accounts still waiting for a parent. */
async function familiesList(ctx: Ctx): Promise<CommandResult> {
  const [links, pending] = await Promise.all([
    prisma.familyLink.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { parent: { select: { id: true, username: true, kind: true } }, child: { select: { username: true } } },
    }),
    prisma.user.findMany({
      where: { consent: "PENDING" },
      orderBy: { consentDeadline: "asc" },
      take: 200,
      select: { username: true, needsSetup: true, birthDate: true, consentDeadline: true, consentRequest: { select: { method: true } } },
    }),
  ]);
  await log(ctx, "families", "site", null, "families");
  const byParent = new Map<string, { username: string; kind: string; children: string[] }>();
  for (const l of links) {
    const entry = byParent.get(l.parent.id) ?? { username: l.parent.username, kind: l.parent.kind, children: [] };
    entry.children.push(`@${l.child.username}`);
    byParent.set(l.parent.id, entry);
  }
  return {
    ok: true,
    message: `${byParent.size} family account${byParent.size === 1 ? "" : "s"}, ${pending.length} waiting for a parent.`,
    blocks: [
      byParent.size
        ? {
            kind: "table",
            columns: ["Parent", "Children"],
            rows: [...byParent.values()].map((p) => [p.kind === "FAMILY" ? `@${p.username} (family account)` : userLink(p.username), p.children.join(", ")]),
          }
        : { kind: "text", text: "No family accounts yet." },
      pending.length
        ? {
            kind: "table",
            columns: ["Waiting", "Age", "Parent contacted", "Deleted if not approved by"],
            rows: pending.map((u) => [
              u.needsSetup ? "(still signing up)" : `@${u.username}`,
              String(ageFrom(u.birthDate) ?? "?"),
              u.consentRequest ? (u.consentRequest.method === "EMAIL" ? "by email" : "by text") : "not yet",
              u.consentDeadline ? date(u.consentDeadline) : "",
            ]),
          }
        : { kind: "text", text: "No accounts waiting for a parent." },
    ],
  };
}

async function stats(): Promise<CommandResult> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const week = new Date(now.getTime() - 7 * DAY);
  const [users, books, removed, views, reports, openReports, appeals, signupsToday, signupsWeek] = await Promise.all([
    prisma.user.count(),
    prisma.fanfic.count({ where: { removed: false } }),
    prisma.fanfic.count({ where: { removed: true } }),
    prisma.fanfic.aggregate({ _sum: { views: true } }),
    prisma.report.count(),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.appeal.count({ where: { status: "OPEN" } }),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
  ]);
  return {
    ok: true,
    message: "Writt at a glance.",
    blocks: [
      {
        kind: "fields",
        items: [
          ["Users", String(users)],
          ["Books", `${books} (+${removed} removed)`],
          ["Total views", String(views._sum.views ?? 0)],
          ["Reports", `${reports} (${openReports} open)`],
          ["Open appeals", String(appeals)],
          ["Sign-ups today (UTC)", String(signupsToday)],
          ["Sign-ups this week", String(signupsWeek)],
          ["Removal threshold", `${await getReportThreshold()} reports`],
        ],
      },
    ],
  };
}

function help(): CommandResult {
  return {
    ok: true,
    message: "Every admin command. Books can be a link or an id; users are @username.",
    blocks: [
      {
        kind: "table",
        columns: ["Group", "Command", "What it does"],
        rows: COMMANDS.map((c) => [c.group, usage(c), c.description + (c.destructive ? " (asks to confirm)" : "")]),
      },
    ],
  };
}
