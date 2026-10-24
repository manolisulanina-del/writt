import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth/admin";
import { runFamilyJobs } from "@/lib/family";

/**
 * Deletes kids' accounts nobody approved within 7 days and applies birthdays
 * (13: new restrictions, 16: restrictions end). Pages also run this at most
 * every 10 minutes; call it daily from a scheduler for exact timing. Requires
 * the CRON_SECRET bearer token, or the signed-in admin. Everyone else gets a 404.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized = (secret && request.headers.get("authorization") === `Bearer ${secret}`) || (await getAdmin());
  if (!authorized) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({ ok: true, ...(await runFamilyJobs()) });
}
