import writeExcelFile from "write-excel-file/node";
import type { SheetData } from "write-excel-file/node";
import type { CellValue, ReconciliationRecord } from "./document-types";

function excelValue(value: CellValue) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (/^-?(?:0|[1-9]\d{0,12})(?:\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
}

function moneyValue(value: number | null) {
  return value === null ? null : value / 100;
}

function verificationSheet(reconciliation: ReconciliationRecord): SheetData {
  const rows: SheetData = [
    [{ value: "Statement verification", fontWeight: "bold" as const, fontSize: 14 }],
    ["Status", reconciliation.status.replaceAll("_", " ")],
    ["Verification level", reconciliation.verification_level.replaceAll("_", " ")],
    ["Bank", reconciliation.bank_name || ""],
    ["Currency", reconciliation.currency],
    ["Statement start", reconciliation.statement_start || ""],
    ["Statement end", reconciliation.statement_end || ""],
    ["Opening balance", moneyValue(reconciliation.opening_balance)],
    ["Total credits", moneyValue(reconciliation.total_credits)],
    ["Total debits", moneyValue(reconciliation.total_debits)],
    ["Calculated closing balance", moneyValue(reconciliation.calculated_closing_balance)],
    ["Statement closing balance", moneyValue(reconciliation.statement_closing_balance)],
    ["Difference", moneyValue(reconciliation.closing_difference)],
    ["Transactions", reconciliation.transaction_count],
    ["Running balance checks", reconciliation.running_balance_checks],
    ["Running balance failures", reconciliation.running_balance_failures],
    ["Page continuity checks", reconciliation.page_checks],
    ["Page continuity failures", reconciliation.failed_page_checks],
    [],
    [{ value: "Issues", fontWeight: "bold" as const }]
  ];

  if (!reconciliation.issues.length) rows.push(["None"]);
  else reconciliation.issues.forEach((issue) => {
    rows.push([
      issue.rowNumber ? `Row ${issue.rowNumber}` : issue.page ? `Page ${issue.page}` : "Statement",
      issue.type.replaceAll("_", " "),
      issue.difference === undefined ? "" : issue.difference / 100
    ]);
  });
  return rows;
}

export async function buildWorkbook(
  columns: string[],
  rows: Array<Record<string, CellValue>>,
  title = "Extracted data",
  reconciliation?: ReconciliationRecord | null
) {
  const header: SheetData[number] = columns.map((column) => ({
    value: column,
    fontWeight: "bold" as const,
    backgroundColor: "#226B4E",
    textColor: "#FFFFFF"
  }));
  const data: SheetData = rows.map((row) => columns.map((column) => excelValue(row[column] ?? null)));
  const transactions: SheetData = [header, ...data];

  if (!reconciliation) {
    return writeExcelFile(transactions, {
      sheet: title.slice(0, 31) || "Extracted data",
      stickyRowsCount: 1
    }).toBuffer();
  }

  return writeExcelFile([
    {
      data: transactions,
      sheet: "Transactions",
      stickyRowsCount: 1
    },
    {
      data: verificationSheet(reconciliation),
      sheet: "Verification"
    }
  ]).toBuffer();
}
