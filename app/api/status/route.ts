import { checkPreviewAccess, blockedPreviewResponse } from "../../../lib/preview-access.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await checkPreviewAccess(request.headers.get("authorization"), {
    username: process.env.PREVIEW_ACCESS_USERNAME,
    password: process.env.PREVIEW_ACCESS_PASSWORD
  });
  if (result !== "allowed") return blockedPreviewResponse(result);
  return Response.json({
    status: "foundation",
    conversionAvailable: false
  }, { headers: { "Cache-Control": "private, no-store" } });
}
