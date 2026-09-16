import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import type { CellValue } from "../../lib/document-types";
import type { Database, Json } from "../../lib/database.types";
import { reconcileStatement } from "../../lib/reconciliation.mjs";

type BankTransaction = {
  date?: unknown;
  description?: unknown;
  debit?: unknown;
  credit?: unknown;
  balance?: unknown;
  page?: unknown;
};

type BankStatementExtraction = {
  detected?: unknown;
  bankName?: unknown;
  currency?: unknown;
  statementStart?: unknown;
  statementEnd?: unknown;
  openingBalance?: unknown;
  closingBalance?: unknown;
  transactions?: unknown;
  pageBalances?: unknown;
};

type Extraction = {
  title?: unknown;
  columns?: unknown;
  rows?: unknown;
  warnings?: unknown;
  bankStatement?: BankStatementExtraction;
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

function cleanString(value: unknown, maxLength = 200) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanMoneyString(value: unknown) {
  return cleanString(value, 80);
}

function cleanPage(value: unknown) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page <= 10000 ? page : null;
}

function normaliseBankTransactions(input: unknown): BankTransaction[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 2000).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
    date: cleanString(item.date, 40),
    description: cleanString(item.description, 500) ?? "",
    debit: cleanMoneyString(item.debit),
    credit: cleanMoneyString(item.credit),
    balance: cleanMoneyString(item.balance),
    page: cleanPage(item.page)
  }));
}

function normalisePageBalances(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 500).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
    page: cleanPage(item.page),
    openingBalance: cleanMoneyString(item.openingBalance),
    closingBalance: cleanMoneyString(item.closingBalance)
  }));
}

function bankRows(transactions: BankTransaction[]) {
  return transactions.map((transaction) => ({
    Date: cleanString(transaction.date, 40) ?? "",
    Description: cleanString(transaction.description, 500) ?? "",
    Debit: cleanMoneyString(transaction.debit) ?? "",
    Credit: cleanMoneyString(transaction.credit) ?? "",
    Balance: cleanMoneyString(transaction.balance) ?? "",
    Page: cleanPage(transaction.page) ?? ""
  }));
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
      "Use concise column names. Do not invent values. Use an empty string when a generic-table cell is unreadable.",
      "Also determine whether the document is a bank statement.",
      "If it is a bank statement, populate bankStatement using only values visible in the document: bank name, currency, statement dates, opening balance, closing balance, transactions and page carry balances when available.",
      "For bank transactions, debit and credit must be separate fields. Use null when a bank-statement value is unavailable or unreadable. Never infer or fabricate a missing monetary value.",
      "Preserve the printed running balance for each transaction when present and the source page number when identifiable.",
      "Add a warning for unclear cells, missing headers, multiple unrelated tables or possible extraction errors."
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
          maxOutputTokens: 24576,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            required: ["title", "columns", "rows", "warnings", "bankStatement"],
            properties: {
              title: { type: "STRING" },
              columns: { type: "ARRAY", items: { type: "STRING" } },
              rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING", nullable: true } } },
              warnings: { type: "ARRAY", items: { type: "STRING" } },
              bankStatement: {
                type: "OBJECT",
                required: ["detected", "bankName", "currency", "statementStart", "statementEnd", "openingBalance", "closingBalance", "transactions", "pageBalances"],
                properties: {
                  detected: { type: "BOOLEAN" },
                  bankName: { type: "STRING", nullable: true },
                  currency: { type: "STRING", nullable: true },
                  statementStart: { type: "STRING", nullable: true },
                  statementEnd: { type: "STRING", nullable: true },
                  openingBalance: { type: "STRING", nullable: true },
                  closingBalance: { type: "STRING", nullable: true },
                  transactions: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      required: ["date", "description", "debit", "credit", "balance", "page"],
                      properties: {
                        date: { type: "STRING", nullable: true },
                        description: { type: "STRING", nullable: true },
                        debit: { type: "STRING", nullable: true },
                        credit: { type: "STRING", nullable: true },
                        balance: { type: "STRING", nullable: true },
                        page: { type: "INTEGER", nullable: true }
                      }
                    }
                  },
                  pageBalances: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      required: ["page", "openingBalance", "closingBalance"],
                      properties: {
                        page: { type: "INTEGER", nullable: true },
                        openingBalance: { type: "STRING", nullable: true },
                        closingBalance: { type: "STRING", nullable: true }
                      }
                    }
                  }
                }
              }
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
    const warnings = cleanWarnings(extraction.warnings);
    const detectedBankStatement = extraction.bankStatement?.detected === true;

    let columns = uniqueColumns(extraction.columns);
    let rows = rowsToObjects(columns, extraction.rows);

    if (detectedBankStatement) {
      const bankStatement = extraction.bankStatement ?? {};
      const transactions = normaliseBankTransactions(bankStatement.transactions);
      const pageBalances = normalisePageBalances(bankStatement.pageBalances);
      if (!transactions.length) {
        warnings.push("Bank statement detected, but no transaction rows could be extracted for verification.");
      } else {
        columns = ["Date", "Description", "Debit", "Credit", "Balance", "Page"];
        rows = bankRows(transactions);
      }

      const reconciliation = reconcileStatement({
        currency: cleanString(bankStatement.currency, 10) ?? "GBP",
        openingBalance: cleanMoneyString(bankStatement.openingBalance),
        closingBalance: cleanMoneyString(bankStatement.closingBalance),
        transactions: transactions.map((transaction, index) => ({
          rowNumber: index + 1,
          date: cleanString(transaction.date, 40),
          description: cleanString(transaction.description, 500),
          debit: cleanMoneyString(transaction.debit),
          credit: cleanMoneyString(transaction.credit),
          balance: cleanMoneyString(transaction.balance),
          page: cleanPage(transaction.page)
        })),
        pageBalances
      });

      const sourceMetadata = {
        bankName: cleanString(bankStatement.bankName, 200),
        statementStart: cleanString(bankStatement.statementStart, 80),
        statementEnd: cleanString(bankStatement.statementEnd, 80),
        openingBalanceRaw: cleanMoneyString(bankStatement.openingBalance),
        closingBalanceRaw: cleanMoneyString(bankStatement.closingBalance),
        pageBalances
      } as Json;

      const { error: reconciliationError } = await supabase.from("document_reconciliations").upsert({
        document_id: documentId,
        user_id: userData.user.id,
        status: reconciliation.status,
        verification_level: reconciliation.verificationLevel,
        currency: reconciliation.currency,
        bank_name: cleanString(bankStatement.bankName, 200),
        statement_start: cleanString(bankStatement.statementStart, 80),
        statement_end: cleanString(bankStatement.statementEnd, 80),
        opening_balance: reconciliation.openingBalance,
        total_credits: reconciliation.totalCredits,
        total_debits: reconciliation.totalDebits,
        calculated_closing_balance: reconciliation.calculatedClosingBalance,
        statement_closing_balance: reconciliation.statementClosingBalance,
        closing_difference: reconciliation.closingDifference,
        transaction_count: reconciliation.transactionCount,
        running_balance_checks: reconciliation.runningBalanceChecks,
        running_balance_failures: reconciliation.runningBalanceFailures,
        page_checks: reconciliation.pageChecks,
        failed_page_checks: reconciliation.failedPageChecks,
        issues: reconciliation.issues as Json,
        source_metadata: sourceMetadata,
        updated_at: new Date().toISOString()
      }, { onConflict: "document_id" });
      if (reconciliationError) throw new Error("reconciliation_store_failed");
    } else {
      await supabase.from("document_reconciliations").delete().eq("document_id", documentId);
    }

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
      warnings: warnings.slice(0, 20),
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
