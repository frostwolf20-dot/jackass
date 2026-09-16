import { NextResponse } from "next/server";

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

// This branch is deployed only to the dedicated bank-reconciliation preview site.
// The custom Basic-auth gate is intentionally disabled here so the owner can preview the system.
export const config = { matcher: ["/:path*"] };
