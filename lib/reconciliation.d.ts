export type ReconciliationStatus = "reconciled" | "review_required" | "failed";
export type VerificationLevel = "full_running_balance" | "partial_running_balance" | "statement_total";

export type ReconciliationTransaction = {
  rowNumber?: number;
  date?: string | null;
  description?: string | null;
  debit?: string | number | null;
  credit?: string | number | null;
  balance?: string | number | null;
  page?: number | null;
};

export type ReconciliationInput = {
  currency?: string | null;
  openingBalance?: string | number | null;
  closingBalance?: string | number | null;
  transactions?: ReconciliationTransaction[];
  pageBalances?: Array<{
    page?: number | null;
    openingBalance?: string | number | null;
    closingBalance?: string | number | null;
  }>;
};

export type ReconciliationIssue = {
  severity: "error";
  type: string;
  rowNumber?: number;
  page?: number;
  field?: string;
  expectedValue?: number;
  actualValue?: number | string;
  difference?: number;
  debit?: number;
  credit?: number;
};

export type ReconciliationResult = {
  status: ReconciliationStatus;
  verificationLevel: VerificationLevel;
  currency: string;
  openingBalance: number | null;
  totalCredits: number;
  totalDebits: number;
  calculatedClosingBalance: number | null;
  statementClosingBalance: number | null;
  closingDifference: number | null;
  transactionCount: number;
  runningBalanceChecks: number;
  runningBalanceFailures: number;
  pageChecks: number;
  failedPageChecks: number;
  issues: ReconciliationIssue[];
  transactionResults: Array<{
    rowNumber: number;
    date: string | null;
    description: string;
    page: number | null;
    debit: number;
    credit: number;
    expectedBalance: number;
    statementBalance: number | null;
    runningBalanceStatus: string;
    difference: number | null;
  }>;
};

export function parseMoneyToMinorUnits(value: unknown): number | null;
export function formatMinorUnits(value: number, currency?: string): string | null;
export function reconcileStatement(input: ReconciliationInput): ReconciliationResult;
