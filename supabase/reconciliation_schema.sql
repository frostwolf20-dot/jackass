-- Branch-only schema for bank statement reconciliation.
-- Apply to an isolated Supabase development branch before end-to-end testing.
-- Do not apply directly to production without a reviewed migration.

create table if not exists public.document_reconciliations (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  status text not null check (status in ('reconciled','review_required','failed')),
  verification_level text not null check (verification_level in ('full_running_balance','partial_running_balance','statement_total')),
  currency text not null default 'GBP',
  bank_name text,
  statement_start text,
  statement_end text,
  opening_balance bigint,
  total_credits bigint not null default 0,
  total_debits bigint not null default 0,
  calculated_closing_balance bigint,
  statement_closing_balance bigint,
  closing_difference bigint,
  transaction_count integer not null default 0,
  running_balance_checks integer not null default 0,
  running_balance_failures integer not null default 0,
  page_checks integer not null default 0,
  failed_page_checks integer not null default 0,
  issues jsonb not null default '[]'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_reconciliations_user_idx
  on public.document_reconciliations(user_id, updated_at desc);

alter table public.document_reconciliations enable row level security;

grant select, insert, update, delete on public.document_reconciliations to authenticated;

create policy "reconciliations_select_own"
  on public.document_reconciliations for select to authenticated
  using ((select auth.uid()) = user_id and exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = (select auth.uid())
  ));

create policy "reconciliations_insert_own"
  on public.document_reconciliations for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = (select auth.uid())
  ));

create policy "reconciliations_update_own"
  on public.document_reconciliations for update to authenticated
  using ((select auth.uid()) = user_id and exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = (select auth.uid())
  ))
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = (select auth.uid())
  ));

create policy "reconciliations_delete_own"
  on public.document_reconciliations for delete to authenticated
  using ((select auth.uid()) = user_id and exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = (select auth.uid())
  ));
