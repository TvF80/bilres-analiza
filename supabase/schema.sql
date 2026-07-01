-- exco-analiza — schemat Supabase
-- Odzwierciedla dokładnie kolumny używane w src/store/CompaniesContext.tsx
-- (rowToCompany / companyToRow). Uruchom w Supabase SQL Editor lub przez CLI:
--   supabase db push
--
-- Uwaga: `zapisy` (dziennik FK, ~42 MB/firma) NIGDY nie trafia do tej tabeli —
-- zostaje wyłącznie w sessionStorage przeglądarki (patrz CLAUDE.md).

create table if not exists companies (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  period           text not null,
  period_labels    jsonb,
  bilans           jsonb not null default '[]'::jsonb,
  rzis             jsonb not null default '[]'::jsonb,
  obroty           jsonb not null default '[]'::jsonb,
  zapisy_url       text,
  raport_miesieczny jsonb,
  grp_data         jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists companies_user_id_idx on companies(user_id);

alter table companies enable row level security;

create policy "companies_select_own" on companies
  for select using (auth.uid() = user_id);

create policy "companies_insert_own" on companies
  for insert with check (auth.uid() = user_id);

create policy "companies_update_own" on companies
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "companies_delete_own" on companies
  for delete using (auth.uid() = user_id);
