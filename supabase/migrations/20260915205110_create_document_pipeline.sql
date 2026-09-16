create extension if not exists pgcrypto;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  status text not null default 'uploading' check (status in ('uploading','queued','processing','completed','failed')),
  title text,
  columns jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  export_path text,
  provider_operation_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_rows (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  row_number integer not null check (row_number >= 1),
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, row_number)
);

create index documents_user_created_idx on public.documents(user_id, created_at desc);
create index document_rows_document_idx on public.document_rows(document_id, row_number);
create index document_rows_user_idx on public.document_rows(user_id);

alter table public.documents enable row level security;
alter table public.document_rows enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.document_rows to authenticated;
grant usage, select on sequence public.document_rows_id_seq to authenticated;

create policy "documents_select_own" on public.documents for select to authenticated using ((select auth.uid()) = user_id);
create policy "documents_insert_own" on public.documents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "documents_update_own" on public.documents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "documents_delete_own" on public.documents for delete to authenticated using ((select auth.uid()) = user_id);

create policy "rows_select_own" on public.document_rows for select to authenticated using (
  (select auth.uid()) = user_id and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid()))
);
create policy "rows_insert_own" on public.document_rows for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid()))
);
create policy "rows_update_own" on public.document_rows for update to authenticated
using ((select auth.uid()) = user_id and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())))
with check ((select auth.uid()) = user_id and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));
create policy "rows_delete_own" on public.document_rows for delete to authenticated using (
  (select auth.uid()) = user_id and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid()))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp']),
  ('exports', 'exports', false, 10485760, array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "documents_storage_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_select_own" on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_update_own" on storage.objects for update to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exports_storage_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exports_storage_select_own" on storage.objects for select to authenticated using (bucket_id = 'exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exports_storage_update_own" on storage.objects for update to authenticated using (bucket_id = 'exports' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exports_storage_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
