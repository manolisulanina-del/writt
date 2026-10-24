import { NextResponse } from "next/server";

/** The short link in parent texts (/a/<token>) opens the normal approval page. */
export async function GET(request: Request, ctx: RouteContext<"/a/[token]">) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(`/approve/${encodeURIComponent(token)}`, request.url));
}
