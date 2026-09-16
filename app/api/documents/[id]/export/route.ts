import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildWorkbook } from "../../../../../lib/workbook";
import type { Database } from "../../../../../lib/database.types";
import type { CellValue } from "../../../../../lib/document-types";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authHeader = request.headers.get("x-supabase-authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!url || !key) return NextResponse.json({ error: "Export is not configured." }, { status: 503 });
  if (!accessToken) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { id } = await context.params;
  const { data: document } = await supabase
    .from("documents")
    .select("id,user_id,title,original_name,columns")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data: rows, error: rowsError } = await supabase
    .from("document_rows")
    .select("row_data")
    .eq("document_id", id)
    .order("row_number");
  if (rowsError || !rows?.length) return NextResponse.json({ error: "No extracted rows are available." }, { status: 409 });

  const workbook = await buildWorkbook(
    document.columns as string[],
    rows.map((row) => row.row_data as Record<string, CellValue>),
    document.title || "Extracted data"
  );
  const exportPath = `${userData.user.id}/${id}/converted.xlsx`;
  const { error: uploadError } = await supabase.storage.from("exports").upload(exportPath, workbook, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: true,
    cacheControl: "0"
  });
  if (uploadError) return NextResponse.json({ error: "Excel export could not be stored." }, { status: 500 });

  await supabase.from("documents").update({ export_path: exportPath, updated_at: new Date().toISOString() }).eq("id", id);
  const { data: signed, error: signedError } = await supabase.storage.from("exports").createSignedUrl(exportPath, 60, {
    download: `${document.original_name.replace(/\.[^.]+$/, "") || "converted"}.xlsx`
  });
  if (signedError || !signed) return NextResponse.json({ error: "Download link could not be created." }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl, expiresIn: 60 });
}
