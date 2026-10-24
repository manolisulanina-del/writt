import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser, requireUser, type CurrentUser } from "@/lib/session";
import { isAdmin } from "./admin-identity";

// The single admin check. Every admin page, server action and route handler
// goes through here, using the logged-in user as stored in the database.

export { isAdmin } from "./admin-identity";

/** For admin pages and server actions: the admin, or a 404 for everyone else. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  return user;
}

/** For route handlers: the admin, or null so the handler can answer 404 itself. */
export async function getAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && isAdmin(user) ? user : null;
}
