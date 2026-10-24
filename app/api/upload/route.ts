import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";
import { isBanned } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { saveImage, sniffImageType } from "@/lib/storage";

/** POST multipart/form-data with a single "file" field. Returns { url }. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (isBanned(user)) return NextResponse.json({ error: "This account is banned." }, { status: 403 });
  // Family-only accounts don't post, and kids' accounts can't while locked or paused.
  if (user.kind === "FAMILY" || user.consent === "PENDING" || user.consent === "REVOKED" || user.paused) {
    return NextResponse.json({ error: "Uploads aren’t available on this account right now." }, { status: 403 });
  }

  const limit = await rateLimit(`upload:${user.id}`, 60, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "You’re uploading too fast. Wait a few minutes." }, { status: 429 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });

  const maxBytes = config.maxUploadMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `Images must be under ${config.maxUploadMb} MB.` }, { status: 413 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (!sniffImageType(data)) {
    return NextResponse.json({ error: "Use a PNG, JPEG, GIF or WebP image." }, { status: 415 });
  }

  const { url } = await saveImage(data, user.id);
  return NextResponse.json({ url }, { status: 201 });
}
