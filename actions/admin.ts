"use server";

import type { CommandResult } from "@/lib/admin/catalog";
import { runCommand } from "@/lib/admin/run";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * Runs one admin command, from the command box or an Admin menu. The admin is
 * verified on the server every time; destructive commands also need
 * `confirmed`, which the interface sets only after its "Are you sure?" popup.
 */
export async function runAdminCommandAction(input: string, confirmed = false): Promise<CommandResult> {
  const admin = await requireAdmin();
  if (typeof input !== "string" || input.length > 2000) return { ok: false, message: "That command is too long." };
  return runCommand(input, { admin, input, confirmed: confirmed === true });
}
