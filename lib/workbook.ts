import writeExcelFile from "write-excel-file/node";
import type { SheetData } from "write-excel-file/node";
import type { CellValue } from "./document-types";

function excelValue(value: CellValue) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (/^-?(?:0|[1-9]\d{0,12})(?:\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
}

export async function buildWorkbook(
  columns: string[],
  rows: Array<Record<string, CellValue>>,
  title = "Extracted data"
) {
  const header: SheetData[number] = columns.map((column) => ({
    value: column,
    fontWeight: "bold" as const,
    backgroundColor: "#226B4E",
    textColor: "#FFFFFF"
  }));
  const data: SheetData = rows.map((row) => columns.map((column) => excelValue(row[column] ?? null)));
  return writeExcelFile([header, ...data], {
    sheet: title.slice(0, 31) || "Extracted data",
    stickyRowsCount: 1
  }).toBuffer();
}
