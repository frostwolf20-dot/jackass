export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      documents: {
        Row: {
          id: string; user_id: string; original_name: string; storage_path: string;
          mime_type: string; size_bytes: number; status: string; title: string | null;
          columns: Json; warnings: Json; export_path: string | null;
          provider_operation_id: string | null; error_code: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; user_id?: string; original_name: string; storage_path: string;
          mime_type: string; size_bytes: number; status?: string; title?: string | null;
          columns?: Json; warnings?: Json; export_path?: string | null;
          provider_operation_id?: string | null; error_code?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      document_rows: {
        Row: {
          id: number; document_id: string; user_id: string; row_number: number;
          row_data: Json; created_at: string; updated_at: string;
        };
        Insert: {
          id?: never; document_id: string; user_id?: string; row_number: number;
          row_data?: Json; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["document_rows"]["Insert"]>;
        Relationships: [{
          foreignKeyName: "document_rows_document_id_fkey";
          columns: ["document_id"];
          isOneToOne: false;
          referencedRelation: "documents";
          referencedColumns: ["id"];
        }];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
