// Who the admin is. Pure functions with no request or database access, so the
// proxy, the session layer and the admin guard can all share them.
import { config } from "@/lib/config";

type Identity = { id?: string | null; email?: string | null; role?: string | null };

function emailMatches(email: string | null | undefined): boolean {
  return Boolean(config.adminEmail) && email?.trim().toLowerCase() === config.adminEmail;
}

function idMatches(id: string | null | undefined): boolean {
  return !config.adminUserId || id === config.adminUserId;
}

/**
 * The one admin: the account whose email is ADMIN_EMAIL and, when
 * ADMIN_USER_ID is set, whose id matches it too. The stored role must also be
 * ADMIN. Nothing the browser sends feeds into this; callers pass the user as
 * loaded from the database (or the server-signed session token, in the proxy).
 */
export function isAdmin(user: Identity | null | undefined): boolean {
  return Boolean(user && user.role === "ADMIN" && emailMatches(user.email) && idMatches(user.id));
}

/** The role an existing account should have. Used to keep the stored role in sync on every sign-in. */
export function roleForAccount(id: string, email: string | null | undefined): "ADMIN" | "USER" {
  return emailMatches(email) && idMatches(id) ? "ADMIN" : "USER";
}

/**
 * The role for an account being created. Once ADMIN_USER_ID pins the admin,
 * no new account can be admin, even one registered with ADMIN_EMAIL (sign-up
 * doesn't prove you own an email address).
 */
export function roleForNewAccount(email: string | null | undefined): "ADMIN" | "USER" {
  return !config.adminUserId && emailMatches(email) ? "ADMIN" : "USER";
}
