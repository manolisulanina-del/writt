"use client";

import { AdminMenu, type AdminItem } from "./AdminMenu";

const reasonField = { name: "reason", label: "Reason", placeholder: "Shown to the user" };
const daysField = { name: "days", label: "Days", placeholder: "e.g. 7", required: true };
const opt = (v: string | undefined) => (v?.trim() ? ` ${v.trim()}` : "");

/** Admin actions for one book. */
export function BookAdminMenu({
  book,
}: {
  book: { id: string; removed: boolean; featured: boolean; hotMode: string; commentsLocked: boolean; visibility: string };
}) {
  const id = book.id;
  const items: AdminItem[] = [
    book.removed
      ? { label: "Restore", command: () => `/restore ${id}` }
      : { label: "Remove", command: (v) => `/remove ${id}${opt(v.reason)}`, fields: [reasonField], destructive: true },
    ...(book.removed || book.visibility !== "PUBLIC"
      ? []
      : [
          book.featured
            ? { label: "Unfeature", command: () => `/unfeature ${id}` }
            : { label: "Feature on homepage", command: () => `/feature ${id}` },
          { label: "Hide (make private)", command: () => `/hide ${id}` },
        ]),
    book.hotMode === "ON" ? { label: "Remove Hot label", command: () => `/unhot ${id}` } : { label: "Label Hot", command: () => `/hot ${id}` },
    book.commentsLocked
      ? { label: "Turn comments on", command: () => `/unlockcomments ${id}` }
      : { label: "Turn comments off", command: () => `/lockcomments ${id}` },
    { label: "Show reports", href: `/admin?cmd=${encodeURIComponent(`/reports ${id}`)}` },
    { label: "Clear reports", command: () => `/clearreports ${id}`, destructive: true, note: "Deletes every report on this book." },
    { label: "Clear comments", command: () => `/clearcomments ${id}`, destructive: true, note: "Deletes every comment on this book." },
    { label: "Delete permanently", command: () => `/delete ${id}`, destructive: true, note: "Deletes the book and its images for good. This can’t be undone." },
  ];
  return <AdminMenu items={items} />;
}

/** Admin actions for one user (not shown on the admin's own profile). */
export function UserAdminMenu({
  user,
  align,
}: {
  user: { username: string; banned: boolean; muted: boolean; blocked: boolean };
  align?: "left" | "right";
}) {
  const at = `@${user.username}`;
  const items: AdminItem[] = [
    { label: "Look up", href: `/admin?cmd=${encodeURIComponent(`/lookup ${at}`)}` },
    { label: "Message", href: `/messages/${user.username}` },
    user.banned
      ? { label: "Unban", command: () => `/unban ${at}` }
      : {
          label: "Ban",
          command: (v) => `/ban ${at} ${v.days.trim()}${opt(v.reason)}`,
          fields: [{ ...daysField, label: "Days, or “forever”" }, reasonField],
          destructive: true,
        },
    user.blocked
      ? { label: "Unblock creating", command: () => `/unblock ${at}` }
      : { label: "Block creating", command: (v) => `/block ${at} ${v.days.trim()}${opt(v.reason)}`, fields: [daysField, reasonField] },
    user.muted
      ? { label: "Unmute", command: () => `/unmute ${at}` }
      : { label: "Mute", command: (v) => `/mute ${at} ${v.days.trim()}${opt(v.reason)}`, fields: [daysField, reasonField] },
    { label: "Warn", command: (v) => `/warn ${at} ${v.message.trim()}`, fields: [{ name: "message", label: "Warning", required: true, multiline: true }] },
    { label: "Remove profile picture", command: () => `/resetpfp ${at}` },
    { label: "Rename", command: (v) => `/rename ${at} ${v.name.trim()}`, fields: [{ name: "name", label: "New username", required: true }] },
    { label: "Delete account", command: () => `/deleteuser ${at}`, destructive: true, note: `Deletes ${at} and everything they posted, for good.` },
  ];
  return <AdminMenu items={items} align={align} />;
}

/** Admin actions for one fandom or tag (by id, so names with spaces need no quoting). */
export function TagAdminMenu({ tagId, name }: { tagId: string; name: string }) {
  return (
    <AdminMenu
      align="right"
      items={[
        { label: "Show books", href: `/t/${tagId}` },
        { label: "Rename", command: (v) => `/renametag ${tagId} ${v.name.trim()}`, fields: [{ name: "name", label: "New name", required: true, placeholder: name }] },
        {
          label: "Merge into…",
          command: (v) => `/mergetag ${tagId} ${v.into.trim()}`,
          fields: [{ name: "into", label: "Tag to merge into (name or id)", required: true }],
          destructive: true,
          note: `Every book tagged “${name}” moves to the other tag, then “${name}” is deleted.`,
        },
        { label: "Delete", command: () => `/deletetag ${tagId}`, destructive: true, note: `Removes “${name}” from every book and deletes it.` },
      ]}
    />
  );
}

/** Admin actions for one comment. */
export function CommentAdminMenu({ commentId, author, onDeleted }: { commentId: string; author: string; onDeleted?: () => void }) {
  return (
    <AdminMenu
      align="right"
      onSuccess={(label) => label === "Delete comment" && onDeleted?.()}
      items={[
        { label: "Delete comment", command: () => `/deletecomment ${commentId}`, destructive: true },
        { label: `Mute @${author}`, command: (v) => `/mute @${author} ${v.days.trim()}${opt(v.reason)}`, fields: [daysField, reasonField] },
        { label: `Warn @${author}`, command: (v) => `/warn @${author} ${v.message.trim()}`, fields: [{ name: "message", label: "Warning", required: true, multiline: true }] },
      ]}
    />
  );
}
