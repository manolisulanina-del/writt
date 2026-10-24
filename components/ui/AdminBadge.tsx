/** Small "Admin" pill shown next to the admin's name everywhere. */
export function AdminBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-ink px-1.5 py-px align-middle text-[10px] font-bold tracking-wider text-paper uppercase"
      title="Writt admin"
    >
      Admin
    </span>
  );
}

/** "@username" plus the Admin badge for the admin account. */
export function Handle({ username, role }: { username: string; role?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      @{username}
      {role === "ADMIN" && <AdminBadge />}
    </span>
  );
}
