import { readObject } from "@/lib/storage";

export async function GET(_request: Request, ctx: RouteContext<"/api/files/[driver]/[key]">) {
  const { driver, key } = await ctx.params;
  const file = await readObject(driver, key);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.contentType,
      // Keys are never reused, so the bytes behind a URL never change.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
