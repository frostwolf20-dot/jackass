import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import type { CellValue } from "../../lib/document-types";
import type { Database, Json } from "../../lib/database.types";

type Extraction = {
  title?: unknown;
  columns?: unknown;
  rows?: unknown;
  warnings?: unknown;
};

function env(name: string) {
  const runtime = (globalThis as typeof globalThis & {
    Netlify?: { env?: { get(key: string): string | undefined } };
  }).Netlify;
  return runtime?.env?.get(name) ?? process.env[name];
}

function uniqueColumns(input: unknown) {
  if (!Array.isArray(input)) return [];
  const seen = new Map<string, number>();
  return input.slice(0, 50).map((value, index) => {
    const base = String(value || `Column ${index + 1}`).trim().slice(0, 100) || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

function rowsToObjects(columns: string[], input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 2000).filter(Array.isArray).map((row) =>
    Object.fromEntries(columns.map((column, index) => {
      const value = row[index];
      const safe: CellValue = value === null || ["string", "number", "boolean"].includes(typeof value)
        ? value as CellValue
        : String(value ?? "");
      return [column, safe];
    }))
  );
}

function cleanWarnings(input: unknown) {
  return Array.isArray(input) ? input.slice(0, 20).map((item) => String(item).slice(0, 300)) : [];
}

export default async (req: Request, context: Context) => {
  let documentId = "unknown";
  let supabase: ReturnType<typeof createClient<Database>> | undefined;

  try {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    const geminiKey = env("GEMINI_API_KEY");
    const geminiBaseUrl = env("GOOGLE_GEMINI_BASE_URL");
    const authHeader = req.headers.get("x-supabase-authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");

    if (!url || !key || !geminiKey || !geminiBaseUrl || !accessToken) {
      return new Response(null, { status: 503 });
    }

    const payload = await req.json() as { documentId?: string };
    documentId = payload.documentId ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) return new Response(null, { status: 400 });

    supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) return new Response(null, { status: 401 });

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id,user_id,storage_path,mime_type,original_name")
      .eq("id", documentId)
      .eq("user_id", userData.user.id)
      .single();
    if (documentError || !document) return new Response(null, { status: 404 });

    await supabase.from("documents").update({
      status: "processing",
      provider_operation_id: context.requestId,
      error_code: null,
      updated_at: new Date().toISOString()
    }).eq("id", documentId);

    const { data: file, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path);
    if (downloadError || !file) throw new Error("storage_download_failed");

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw new Error("file_too_large");

    const prompt = [
      "Extract the primary useful table from this document into spreadsheet-ready data.",
      "Handle bank statements, invoices, receipts, reports and photographed tables.",
      "Return every visible row in reading order. Preserve dates, identifiers, minus signs and decimal precision.",
      "Use concise column names. Do not invent values. Use an empty string when a cell is unreadable.",
      "Add a warning for unclear cells, missing headers, multiple unrelated tables or possible OCR errors."
    ].join(" ");

    const aiResponse = await fetch(`${geminiBaseUrl.replace(/\/$/, "")}/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": geminiKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { text: prompt },
          { inlineData: { mimeType: document.mime_type, data: bytes.toString("base64") } }
        ] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            required: ["title", "columns", "rows", "warnings"],
            properties: {
              title: { type: "STRING" },
              columns: { type: "ARRAY", items: { type: "STRING" } },
              rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING", nullable: true } } },
              warnings: { type: "ARRAY", items: { type: "STRING" } }
            }
          }
        }
      })
    });
    if (!aiResponse.ok) throw new Error(`ai_${aiResponse.status}`);

    const aiJson = await aiResponse.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = aiJson.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) throw new Error("ai_empty_response");

    const extraction = JSON.parse(text) as Extraction;
    const columns = uniqueColumns(extraction.columns);
    const rows = rowsToObjects(columns, extraction.rows);
    if (!columns.length || !rows.length) throw new Error("no_table_found");

    const { error: deleteError } = await supabase.from("document_rows").delete().eq("document_id", documentId);
    if (deleteError) throw new Error("row_replace_failed");

    for (let start = 0; start < rows.length; start += 200) {
      const batch = rows.slice(start, start + 200).map((rowData, offset) => ({
        document_id: documentId,
        user_id: userData.user.id,
        row_number: start + offset + 1,
        row_data: rowData as Json
      }));
      const { error: insertError } = await supabase.from("document_rows").insert(batch);
      if (insertError) throw new Error("row_insert_failed");
    }

    const { error: finishError } = await supabase.from("documents").update({
      status: "completed",
      title: String(extraction.title || document.original_name).slice(0, 200),
      columns,
      warnings: cleanWarnings(extraction.warnings),
      error_code: null,
      updated_at: new Date().toISOString()
    }).eq("id", documentId);
    if (finishError) throw new Error("document_update_failed");

    return new Response(null, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) : "processing_failed";
    if (supabase && documentId !== "unknown") {
      await supabase.from("documents").update({
        status: "failed",
        error_code: code,
        updated_at: new Date().toISOString()
      }).eq("id", documentId);
    }
    console.error("document processing failed", { requestId: context.requestId, documentId, code });
    return new Response(null, { status: 202 });
  }
};
