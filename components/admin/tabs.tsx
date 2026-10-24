import Link from "next/link";
import type { ReactNode } from "react";
import type { ReportStatus } from "@prisma/client";
import { prisma, isObjectId } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { REPORT_REASONS } from "@/lib/validation";
import { ReportStatusControl } from "@/components/admin/ReportStatusControl";
import { Avatar } from "@/components/ui/Avatar";
import { Handle } from "@/components/ui/AdminBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { AnnouncementForm, AppealAdminControls, BanWordForm, SettingsForm } from "./forms";
import { BookAdminMenu, CommentAdminMenu, TagAdminMenu, UserAdminMenu } from "./menus";
import { bannedTagWords } from "@/lib/tags";
import bannedConfig from "@/config/banned-tag-words.json";

// Server-rendered tab bodies for /admin. Every tab is reached only through
// app/(main)/admin/page.tsx, which calls requireAdmin() first.

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));
const iso = (d: Date) => d.toISOString();
const now = () => new Date();

function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "danger" | "accent" | "plum" }) {
  const tones = {
    muted: "bg-muted text-ink-soft",
    danger: "bg-danger/10 text-danger",
    accent: "bg-accent-soft text-accent",
    plum: "bg-plum-soft text-plum",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase", tones[tone])}>{children}</span>;
}

function Search({ tab, q, placeholder }: { tab: string; q: string; placeholder: string }) {
  return (
    <form action="/admin" className="mb-5 flex gap-2" role="search">
      <input type="hidden" name="tab" value={tab} />
      <label className="flex-1">
        <span className="sr-only">{placeholder}</span>
        <input
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm focus:border-accent focus:outline-none"
        />
      </label>
      <button className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-paper">Search</button>
    </form>
  );
}

const bookMenuFields = { id: true, removed: true, featured: true, hotMode: true, commentsLocked: true, visibility: true } as const;

// ---- Reports ----

const STATUSES: ReportStatus[] = ["OPEN", "REVIEWED", "DISMISSED"];

export async function ReportsTab({ status: raw }: { status?: string }) {
  const status = STATUSES.find((s) => s === raw) ?? "OPEN";
  const [reports, counts, threshold] = await Promise.all([
    prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        reporter: { select: { username: true, image: true } },
        reviewedBy: { select: { username: true } },
        fanfic: {
          select: { ...bookMenuFields, title: true, author: { select: { username: true } }, _count: { select: { reports: true } } },
        },
      },
    }),
    prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
    getSiteSettings().then((s) => s.reportThreshold),
  ]);
  const countOf = (s: ReportStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <>
      <p className="mb-4 text-sm text-ink-soft">Books are removed automatically at {threshold} reports (dismissed ones don’t count).</p>
      <nav aria-label="Report status" className="mb-5 flex gap-1">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin?tab=reports&status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={cn("rounded-full px-3 py-1.5 text-sm font-semibold capitalize", s === status ? "bg-ink text-paper" : "bg-muted text-ink-soft hover:text-ink")}
          >
            {s.toLowerCase()} {countOf(s)}
          </Link>
        ))}
      </nav>
      {reports.length === 0 ? (
        <EmptyState title={status === "OPEN" ? "All clear" : `No ${status.toLowerCase()} reports`} />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold tracking-widest text-danger uppercase">{REASON_LABEL[r.reason]}</p>
                  <Link href={`/fanfic/${r.fanfic.id}`} className="mt-1 inline-block font-display text-xl font-semibold hover:text-accent">
                    {r.fanfic.title}
                  </Link>{" "}
                  {r.fanfic.removed && <Chip tone="danger">Removed</Chip>}
                  <p className="text-sm text-ink-soft">
                    by @{r.fanfic.author.username} · {r.fanfic._count.reports} report{r.fanfic._count.reports === 1 ? "" : "s"} total
                  </p>
                  {r.details && <p className="mt-3 rounded-xl bg-muted px-3.5 py-2.5 text-sm whitespace-pre-wrap">{r.details}</p>}
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    <Avatar src={r.reporter.image} name={r.reporter.username} size={20} />
                    Reported by @{r.reporter.username} <RelativeTime iso={iso(r.createdAt)} />
                    {r.reviewedBy && r.reviewedAt && (
                      <>
                        · handled by @{r.reviewedBy.username} <RelativeTime iso={iso(r.reviewedAt)} />
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <ReportStatusControl reportId={r.id} status={r.status} />
                  <BookAdminMenu book={r.fanfic} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- Appeals ----

export async function AppealsTab({ id }: { id?: string }) {
  const [open, closed] = await Promise.all([
    prisma.appeal.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, bookTitle: true, createdAt: true, awaitingAdmin: true, user: { select: { username: true } } },
    }),
    prisma.appeal.findMany({
      where: { status: { not: "OPEN" } },
      orderBy: { closedAt: "desc" },
      take: 20,
      select: { id: true, bookTitle: true, status: true, closedAt: true, user: { select: { username: true } } },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <nav aria-label="Appeals" className="space-y-4">
        <div>
          <h3 className="mb-2 text-xs font-bold tracking-widest text-ink-soft uppercase">Open · oldest first</h3>
          {open.length === 0 && <p className="text-sm text-ink-soft">No open appeals.</p>}
          <ul className="space-y-1">
            {open.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin?tab=appeals&id=${a.id}`}
                  aria-current={a.id === id ? "page" : undefined}
                  className="block rounded-xl px-3 py-2 hover:bg-muted aria-[current=page]:bg-accent-soft"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="min-w-0 flex-1 truncate">{a.bookTitle}</span>
                    {a.awaitingAdmin && <span className="size-2 rounded-full bg-accent" aria-label="Waiting on you" />}
                  </span>
                  <span className="text-xs text-ink-soft">
                    @{a.user.username} · <RelativeTime iso={iso(a.createdAt)} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {closed.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-widest text-ink-soft uppercase">Recently closed</h3>
            <ul className="space-y-1">
              {closed.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/admin?tab=appeals&id=${a.id}`}
                    aria-current={a.id === id ? "page" : undefined}
                    className="block rounded-xl px-3 py-2 text-sm hover:bg-muted aria-[current=page]:bg-accent-soft"
                  >
                    <span className="block truncate">{a.bookTitle}</span>
                    <span className="text-xs text-ink-soft">
                      @{a.user.username} · {a.status.toLowerCase()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
      <div>{id && isObjectId(id) ? <AppealDetail id={id} /> : <EmptyState title="Pick an appeal">Choose one on the left, or type /appeals.</EmptyState>}</div>
    </div>
  );
}

async function AppealDetail({ id }: { id: string }) {
  const appeal = await prisma.appeal.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, image: true } },
      fanfic: { select: { ...bookMenuFields, title: true, removedReason: true, author: { select: { username: true } } } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!appeal) return <EmptyState title="Appeal not found" />;
  const reports = await prisma.report.findMany({
    where: { fanficId: appeal.fanficId },
    select: { id: true, reason: true, details: true, reporter: { select: { username: true } } },
  });

  return (
    <article className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-ink-soft uppercase">Appeal · {appeal.status.toLowerCase()}</p>
          <h3 className="font-display text-2xl font-semibold">
            <Link href={`/fanfic/${appeal.fanficId}`} className="hover:text-accent">
              {appeal.bookTitle}
            </Link>
          </h3>
          <p className="text-sm text-ink-soft">
            by @{appeal.fanfic.author.username} · {appeal.fanfic.removed ? `removed: ${appeal.fanfic.removedReason ?? "yes"}` : "live on Writt"}
          </p>
        </div>
        <BookAdminMenu book={appeal.fanfic} />
      </header>

      <ol className="space-y-2" aria-label="Conversation">
        <li className="max-w-[85%] rounded-xl bg-muted px-4 py-3">
          <p className="text-xs font-semibold text-ink-soft">
            @{appeal.user.username} · <RelativeTime iso={iso(appeal.createdAt)} />
          </p>
          <p className="mt-1 whitespace-pre-wrap">{appeal.message}</p>
        </li>
        {appeal.messages.map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-xl px-4 py-3", m.fromAdmin ? "ml-auto bg-ink text-paper" : "bg-muted")}>
            <p className="text-xs font-semibold opacity-70">
              {m.fromAdmin ? "You" : `@${appeal.user.username}`} · <RelativeTime iso={iso(m.createdAt)} />
            </p>
            <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>

      {appeal.status === "OPEN" ? (
        <AppealAdminControls appealId={appeal.id} />
      ) : (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm">
          Closed as <strong>{appeal.status.toLowerCase()}</strong>
          {appeal.decision ? `: ${appeal.decision}` : "."}
        </p>
      )}

      <section>
        <h4 className="mb-2 text-xs font-bold tracking-widest text-ink-soft uppercase">Reports on this book ({reports.length})</h4>
        {reports.length === 0 ? (
          <p className="text-sm text-ink-soft">None (cleared or never reported).</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {reports.map((r) => (
              <li key={r.id}>
                <strong>{REASON_LABEL[r.reason]}</strong> · @{r.reporter.username}
                {r.details && <span className="text-ink-soft"> — {r.details}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

// ---- Books ----

export async function BooksTab({ q }: { q: string }) {
  const id = q.match(/[a-f0-9]{24}/i)?.[0];
  const books = await prisma.fanfic.findMany({
    where: id ? { id } : q ? { title: { contains: q, mode: "insensitive" } } : {},
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      ...bookMenuFields,
      title: true,
      views: true,
      updatedAt: true,
      author: { select: { username: true, role: true } },
      _count: { select: { reports: true } },
    },
  });
  return (
    <>
      <Search tab="books" q={q} placeholder="Search by title, or paste a book link" />
      {books.length === 0 ? (
        <EmptyState title="No books found" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {books.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/fanfic/${b.id}`} className="font-semibold hover:text-accent">
                  {b.title}
                </Link>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                  <Handle username={b.author.username} role={b.author.role} /> · {b.views} views · {b._count.reports} reports ·{" "}
                  <RelativeTime iso={iso(b.updatedAt)} />
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {b.removed ? <Chip tone="danger">Removed</Chip> : <Chip>{b.visibility.toLowerCase()}</Chip>}
                {b.featured && <Chip tone="plum">Featured</Chip>}
                {b.hotMode !== "AUTO" && <Chip tone="accent">Hot {b.hotMode.toLowerCase()}</Chip>}
                {b.commentsLocked && <Chip>Comments off</Chip>}
              </div>
              <BookAdminMenu book={b} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- Users ----

export async function UsersTab({ q, adminId }: { q: string; adminId: string }) {
  const term = q.trim().toLowerCase().replace(/^@/, "");
  const users = await prisma.user.findMany({
    where: term ? { OR: [{ username: { contains: term } }, { email: { contains: term } }, { nickname: { contains: term, mode: "insensitive" } }] } : { needsSetup: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      username: true,
      nickname: true,
      role: true,
      image: true,
      createdAt: true,
      bannedUntil: true,
      mutedUntil: true,
      createBlockedUntil: true,
      _count: { select: { fanfics: true } },
    },
  });
  const t = now();
  return (
    <>
      <Search tab="users" q={q} placeholder="Search by username, nickname or email" />
      {users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {users.map((u) => {
            const banned = Boolean(u.bannedUntil && u.bannedUntil > t);
            const muted = Boolean(u.mutedUntil && u.mutedUntil > t);
            const blocked = Boolean(u.createBlockedUntil && u.createBlockedUntil > t);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar src={u.image} name={u.username} size={36} />
                <div className="min-w-0 flex-1">
                  <Link href={`/u/${u.username}`} className="font-semibold hover:text-accent">
                    <Handle username={u.username} role={u.role} />
                  </Link>
                  <p className="text-xs text-ink-soft">
                    {u.nickname && <>{u.nickname} · </>}
                    {u._count.fanfics} books · joined <RelativeTime iso={iso(u.createdAt)} />
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {banned && <Chip tone="danger">Banned</Chip>}
                  {muted && <Chip>Muted</Chip>}
                  {blocked && <Chip>Can’t create</Chip>}
                </div>
                {u.id !== adminId && <UserAdminMenu user={{ username: u.username, banned, muted, blocked }} align="right" />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ---- Comments ----

export async function CommentsTab({ q }: { q: string }) {
  const comments = await prisma.comment.findMany({
    where: q ? { body: { contains: q, mode: "insensitive" } } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { username: true, role: true } },
      fanfic: { select: { id: true, title: true } },
    },
  });
  return (
    <>
      <Search tab="comments" q={q} placeholder="Search comment text" />
      {comments.length === 0 ? (
        <EmptyState title="No comments found" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                  <Handle username={c.author.username} role={c.author.role} /> on{" "}
                  <Link href={`/fanfic/${c.fanfic.id}`} className="font-semibold hover:text-accent">
                    {c.fanfic.title}
                  </Link>{" "}
                  · <RelativeTime iso={iso(c.createdAt)} />
                </p>
                <p className="mt-1 text-sm break-words whitespace-pre-wrap">{c.body}</p>
              </div>
              {c.author.role !== "ADMIN" ? <CommentAdminMenu commentId={c.id} author={c.author.username} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- Tags ----

export async function TagsTab({ q }: { q: string }) {
  const key = q.trim().toLowerCase().replace(/\s+/g, " ");
  const [tags, banned] = await Promise.all([
    prisma.tag.findMany({
      where: key ? { key: { contains: key } } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, kind: true, createdAt: true, createdBy: { select: { username: true, role: true } }, _count: { select: { books: true } } },
    }),
    bannedTagWords(),
  ]);
  const fromFile = new Set(bannedConfig.words.map((w) => w.toLowerCase()));
  return (
    <div className="space-y-10">
      <section>
        <Search tab="tags" q={q} placeholder="Search fandoms and tags" />
        {tags.length === 0 ? (
          <EmptyState title="No fandoms or tags found" />
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {tags.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/t/${t.id}`} className="font-semibold hover:text-accent">
                    {t.name}
                  </Link>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                    {t.createdBy ? <Handle username={t.createdBy.username} role={t.createdBy.role} /> : "deleted user"} ·{" "}
                    {t._count.books} book{t._count.books === 1 ? "" : "s"} · <RelativeTime iso={iso(t.createdAt)} />
                  </p>
                </div>
                <Chip tone={t.kind === "FANDOM" ? "plum" : "muted"}>{t.kind === "FANDOM" ? "Fandom" : "Tag"}</Chip>
                <TagAdminMenu tagId={t.id} name={t.name} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="max-w-xl space-y-3">
        <h3 className="font-display text-xl font-semibold">Banned words</h3>
        <p className="text-sm text-ink-soft">
          No new fandom or tag may contain these. Words from <code>config/banned-tag-words.json</code> are marked “file”; edit that file to change them.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {banned.map((w) => (
            <li key={w}>
              <Chip tone={fromFile.has(w) ? "muted" : "danger"}>
                {w}
                {fromFile.has(w) ? " · file" : ""}
              </Chip>
            </li>
          ))}
        </ul>
        <BanWordForm />
      </section>
    </div>
  );
}

// ---- Announcements & Settings ----

export async function AnnouncementsTab() {
  const { announcement } = await getSiteSettings();
  return (
    <div className="max-w-xl space-y-5">
      {announcement && (
        <div>
          <p className="mb-2 text-xs font-bold tracking-widest text-ink-soft uppercase">Live now</p>
          <p className="rounded-xl bg-plum px-4 py-3 text-sm font-semibold text-[#f6f1e7]">{announcement}</p>
        </div>
      )}
      <AnnouncementForm current={announcement} />
    </div>
  );
}

export async function SettingsTab() {
  const s = await getSiteSettings();
  return (
    <div className="max-w-xl">
      <SettingsForm threshold={s.reportThreshold} maintenance={s.maintenance} />
    </div>
  );
}

// ---- Log ----

export async function LogTab({ q }: { q: string }) {
  const where = q
    ? {
        OR: [
          { command: { contains: q, mode: "insensitive" as const } },
          { targetLabel: { contains: q, mode: "insensitive" as const } },
          { reason: { contains: q, mode: "insensitive" as const } },
          { action: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const entries = await prisma.adminLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <Search tab="log" q={q} placeholder="Search commands, targets and reasons" />
      {entries.length === 0 ? (
        <EmptyState title={q ? "Nothing matches" : "No admin actions yet"} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 font-semibold">Action</th>
                <th className="px-4 py-2.5 font-semibold">Target</th>
                <th className="px-4 py-2.5 font-semibold">Reason</th>
                <th className="px-4 py-2.5 font-semibold">Command</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line/60 align-top last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-soft">
                    <RelativeTime iso={iso(e.createdAt)} />
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{e.action}</td>
                  <td className="px-4 py-2.5 break-words">{e.targetLabel}</td>
                  <td className="px-4 py-2.5 break-words text-ink-soft">{e.reason ?? ""}</td>
                  <td className="px-4 py-2.5 font-mono text-xs break-all text-ink-soft">{e.command}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
