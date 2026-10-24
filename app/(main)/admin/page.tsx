import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CommandBox } from "@/components/admin/CommandBox";
import { FamiliesTab } from "@/components/admin/FamiliesTab";
import {
  AnnouncementsTab,
  AppealsTab,
  BooksTab,
  CommentsTab,
  LogTab,
  ReportsTab,
  SettingsTab,
  TagsTab,
  UsersTab,
} from "@/components/admin/tabs";
import { Skeleton } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const TABS = [
  { id: "reports", label: "Reports" },
  { id: "appeals", label: "Appeals" },
  { id: "books", label: "Books" },
  { id: "users", label: "Users" },
  { id: "families", label: "Families" },
  { id: "comments", label: "Comments" },
  { id: "tags", label: "Tags" },
  { id: "announcements", label: "Announcements" },
  { id: "settings", label: "Settings" },
  { id: "log", label: "Log" },
] as const;

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Admin searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Admin({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  // Everyone but the admin gets a 404 here; every command re-checks on the server too.
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "reports";
  const q = str(sp.q).trim().slice(0, 200);

  const [openReports, waitingAppeals] = await Promise.all([
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.appeal.count({ where: { status: "OPEN", awaitingAdmin: true } }),
  ]);
  const counter: Partial<Record<(typeof TABS)[number]["id"], number>> = { reports: openReports, appeals: waitingAppeals };

  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-1 mb-6 text-ink-soft">Everything you do here is saved to the Log.</p>

      <CommandBox key={str(sp.cmd)} initialCommand={str(sp.cmd) || undefined} />

      <nav aria-label="Admin sections" className="mt-8 mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition",
              t.id === tab ? "border-accent text-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
            {Boolean(counter[t.id]) && (
              <span className="rounded-full bg-accent px-1.5 py-px text-[11px] text-on-accent" aria-label={`${counter[t.id]} need attention`}>
                {counter[t.id]}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "reports" && <ReportsTab status={str(sp.status)} />}
      {tab === "appeals" && <AppealsTab id={str(sp.id) || undefined} />}
      {tab === "books" && <BooksTab q={q} />}
      {tab === "users" && <UsersTab q={q} adminId={admin.id} />}
      {tab === "families" && <FamiliesTab />}
      {tab === "comments" && <CommentsTab q={q} />}
      {tab === "tags" && <TagsTab q={q} />}
      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "log" && <LogTab q={q} />}
    </>
  );
}
