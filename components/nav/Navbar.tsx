import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LinkButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { BellIcon, BookmarkIcon, CoinIcon, FamilyIcon, InboxIcon, PenIcon, SearchIcon, ShieldIcon } from "@/components/ui/icons";
import { getChildIds } from "@/lib/family";
import { adminUnreadChats } from "@/lib/messages";
import { unreadCount } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Logo />
        <form action="/browse" role="search" className="ml-4 hidden max-w-xs flex-1 md:block">
          <label className="relative block">
            <span className="sr-only">Search stories or authors</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              name="q"
              type="search"
              placeholder="Search books, @authors, fandoms, tags"
              className="h-10 w-full rounded-xl border border-transparent bg-muted pr-3 pl-9 text-sm placeholder:text-ink-soft/70 focus:border-accent focus:bg-surface focus:outline-none"
            />
          </label>
        </form>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
          <Link
            href="/browse"
            className="inline-flex size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-muted hover:text-ink md:hidden"
            aria-label="Search"
          >
            <SearchIcon />
          </Link>
          <ThemeToggle />
          <Suspense fallback={<span className="size-9 animate-pulse rounded-full bg-muted" aria-hidden />}>
            <NavUser />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}

const iconLink = "inline-flex size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-muted hover:text-ink";

function CreateButton() {
  return (
    <LinkButton href="/create" data-tour="create" className="ml-0.5 px-2.5 sm:ml-1 sm:px-4" aria-label="Create">
      <PenIcon className="size-4" />
      {/* Icon only on phones, so the bar fits. */}
      <span className="hidden sm:inline">Create</span>
    </LinkButton>
  );
}

async function NavUser() {
  const user = await getCurrentUser();
  if (!user) return <CreateButton />;
  // Family accounts (parents only) just have their dashboard.
  if (user.kind === "FAMILY") {
    return (
      <LinkButton href="/family" variant="secondary">
        <FamilyIcon className="size-4" /> Family
      </LinkButton>
    );
  }
  const [unread, children, inbox] = await Promise.all([unreadCount(user.id), getChildIds(user.id), isAdmin(user) ? adminUnreadChats() : 0]);
  // Writt's creator has unlimited coins.
  const coins = isAdmin(user) ? "∞" : user.coins.toLocaleString();
  return (
    <>
      {children.length > 0 && (
        // Hidden on phones to keep the bar on one line; the profile page links to it too.
        <Link href="/family" className={`${iconLink} max-sm:hidden`} aria-label="Family dashboard" title="Family dashboard">
          <FamilyIcon />
        </Link>
      )}
      {isAdmin(user) && (
        <Link
          href="/admin"
          className="inline-flex size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-muted hover:text-ink"
          aria-label="Admin panel"
          title="Admin panel"
        >
          <ShieldIcon />
        </Link>
      )}
      {isAdmin(user) && (
        <Link href="/messages" className={`relative ${iconLink}`} aria-label={inbox ? `Inbox (${inbox} unread)` : "Inbox"} title="Inbox">
          <InboxIcon />
          {inbox > 0 && (
            <span className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-bold text-on-accent">
              {inbox > 9 ? "9+" : inbox}
            </span>
          )}
        </Link>
      )}
      <Link
        href="/library"
        className="hidden size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-muted hover:text-ink sm:inline-flex"
        aria-label="Your library"
        title="Your library"
      >
        <BookmarkIcon />
      </Link>
      <Link
        href="/notifications"
        className="relative inline-flex size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-muted hover:text-ink"
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        title="Notifications"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-bold text-on-accent">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <Link
        href={`/u/${user.username}`}
        data-tour="profile"
        className="rounded-full p-0.5 transition hover:ring-2 hover:ring-accent/40"
        aria-label="Your profile"
      >
        <Avatar src={user.image} name={user.username} size={36} />
      </Link>
      <Link
        href="/shop"
        className="inline-flex h-9 items-center gap-1 rounded-full bg-[#f5c542]/20 px-2 text-sm font-bold text-ink tabular-nums hover:bg-[#f5c542]/35 sm:gap-1.5 sm:px-2.5"
        aria-label={`${isAdmin(user) ? "Unlimited" : user.coins} coins. Open the theme shop`}
        title="Your coins: open the theme shop"
      >
        <CoinIcon className="size-4 text-[#b8860b] dark:text-[#f5c542]" />
        {coins}
      </Link>
      <CreateButton />
    </>
  );
}
