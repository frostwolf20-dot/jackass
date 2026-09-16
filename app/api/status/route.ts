import { checkPreviewAccess, blockedPreviewResponse, isPublicProduction } from "../../../lib/preview-access.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const publicProduction = isPublicProduction(process.env.APP_ENV);
  if (!publicProduction) {
    const result = await checkPreviewAccess(request.headers.get("authorization"), {
      username: process.env.PREVIEW_ACCESS_USERNAME,
      password: process.env.PREVIEW_ACCESS_PASSWORD
    });
    if (result !== "allowed") return blockedPreviewResponse(result);
  }
  return Response.json({
    status: publicProduction ? "production" : "private-preview",
    conversionAvailable: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  }, { headers: { "Cache-Control": "private, no-store" } });
}
