import { NextResponse } from "next/server";
import { processDueChapters } from "@/lib/announce";
import { getAdmin } from "@/lib/auth/admin";

/**
 * Publishes scheduled chapters that have come due (counts and notifications).
 * Pages also do this on their own at most once a minute; call this from a
 * scheduler (e.g. Vercel Cron) for exact timing. Requires the CRON_SECRET
 * bearer token, or the signed-in admin. Everyone else gets a 404.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized = (secret && request.headers.get("authorization") === `Bearer ${secret}`) || (await getAdmin());
  if (!authorized) return new NextResponse("Not found", { status: 404 });
  const books = await processDueChapters();
  return NextResponse.json({ ok: true, booksUpdated: books });
}
