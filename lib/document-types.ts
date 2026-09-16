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
