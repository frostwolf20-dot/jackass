import { NextRequest, NextResponse } from "next/server";
import { checkPreviewAccess, blockedPreviewResponse, isPublicProduction } from "./lib/preview-access.mjs";

export async function proxy(request: NextRequest) {
  if (isPublicProduction(process.env.CONTEXT)) return NextResponse.next();
  const result = await checkPreviewAccess(request.headers.get("authorization"), {
    username: process.env.PREVIEW_ACCESS_USERNAME,
    password: process.env.PREVIEW_ACCESS_PASSWORD
  });
  if (result !== "allowed") return blockedPreviewResponse(result);
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

// No path exclusions: HTML, framework assets, RSC responses, APIs and files are gated.
export const config = { matcher: ["/:path*"] };
