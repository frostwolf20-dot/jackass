export type CellValue = string | number | boolean | null;

export type DocumentRecord = {
  id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: "uploading" | "queued" | "processing" | "completed" | "failed";
  title: string | null;
  columns: string[];
  warnings: string[];
  export_path: string | null;
  error_code: string | null;
  created_at: string;
};

export type DocumentRow = {
  id: number;
  document_id: string;
  row_number: number;
  row_data: Record<string, CellValue>;
};

export type ReconciliationIssue = {
  severity?: string;
  type: string;
  rowNumber?: number;
  page?: number;
  field?: string;
  expectedValue?: number;
  actualValue?: number | string;
  difference?: number;
};

export type ReconciliationRecord = {
  document_id: string;
  status: "reconciled" | "review_required" | "failed";
  verification_level: "full_running_balance" | "partial_running_balance" | "statement_total";
  currency: string;
  bank_name: string | null;
  statement_start: string | null;
  statement_end: string | null;
  opening_balance: number | null;
  total_credits: number;
  total_debits: number;
  calculated_closing_balance: number | null;
  statement_closing_balance: number | null;
  closing_difference: number | null;
  transaction_count: number;
  running_balance_checks: number;
  running_balance_failures: number;
  page_checks: number;
  failed_page_checks: number;
  issues: ReconciliationIssue[];
  updated_at: string;
};
