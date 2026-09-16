import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../../../lib/database.types";
import type { CellValue } from "../../../../../lib/document-types";
import { reconcileStatement } from "../../../../../lib/reconciliation.mjs";

export const runtime = "nodejs";

type SourceMetadata = {
  bankName?: string | null;
  statementStart?: string | null;
  statementEnd?: string | null;
  openingBalanceRaw?: string | null;
  closingBalanceRaw?: string | null;
  pageBalances?: Array<{
    page?: number | null;
    openingBalance?: string | null;
    closingBalance?: string | null;
  }>;
};

function cell(row: Record<string, CellValue>, key: string) {
  const value = row[key];
  return value === null || value === undefined ? null : String(value).trim() || null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authHeader = request.headers.get("x-supabase-authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!url || !key) return NextResponse.json({ error: "Reconciliation is not configured." }, { status: 503 });
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
    .select("id,user_id,columns")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const columns = document.columns as string[];
  const required = ["Date", "Description", "Debit", "Credit", "Balance", "Page"];
  if (!required.every((column) => columns.includes(column))) {
    return NextResponse.json({ error: "This document is not a supported bank-statement extraction." }, { status: 409 });
  }

  const [{ data: existing, error: existingError }, { data: rows, error: rowsError }] = await Promise.all([
    supabase.from("document_reconciliations").select("*").eq("document_id", id).single(),
    supabase.from("document_rows").select("row_number,row_data").eq("document_id", id).order("row_number")
  ]);

  if (existingError || !existing) {
    return NextResponse.json({ error: "No reconciliation record is available for this statement." }, { status: 409 });
  }
  if (rowsError || !rows?.length) {
    return NextResponse.json({ error: "No transaction rows are available." }, { status: 409 });
  }

  const metadata = (existing.source_metadata || {}) as SourceMetadata;
  const result = reconcileStatement({
    currency: existing.currency,
    openingBalance: metadata.openingBalanceRaw,
    closingBalance: metadata.closingBalanceRaw,
    pageBalances: Array.isArray(metadata.pageBalances) ? metadata.pageBalances : [],
    transactions: rows.map((entry) => {
      const row = entry.row_data as Record<string, CellValue>;
      const pageValue = cell(row, "Page");
      const page = pageValue && /^\d+$/.test(pageValue) ? Number(pageValue) : null;
      return {
        rowNumber: entry.row_number,
        date: cell(row, "Date"),
        description: cell(row, "Description"),
        debit: cell(row, "Debit"),
        credit: cell(row, "Credit"),
        balance: cell(row, "Balance"),
        page
      };
    })
  });

  const { data: saved, error: saveError } = await supabase.from("document_reconciliations").update({
    status: result.status,
    verification_level: result.verificationLevel,
    opening_balance: result.openingBalance,
    total_credits: result.totalCredits,
    total_debits: result.totalDebits,
    calculated_closing_balance: result.calculatedClosingBalance,
    statement_closing_balance: result.statementClosingBalance,
    closing_difference: result.closingDifference,
    transaction_count: result.transactionCount,
    running_balance_checks: result.runningBalanceChecks,
    running_balance_failures: result.runningBalanceFailures,
    page_checks: result.pageChecks,
    failed_page_checks: result.failedPageChecks,
    issues: result.issues as Json,
    updated_at: new Date().toISOString()
  }).eq("document_id", id).select().single();

  if (saveError || !saved) {
    return NextResponse.json({ error: "The reconciliation result could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ reconciliation: saved });
}
