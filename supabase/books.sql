-- books 테이블 + RLS (Supabase SQL Editor에서 실행)

-- ★ 먼저 실행: entries.category enum에 book 추가 (없으면 분석 재시도 발생)
-- 별도 파일: supabase/entry_category_book.sql
ALTER TYPE public.entry_category ADD VALUE IF NOT EXISTS 'book';

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  author text,
  publisher text,
  isbn text,
  cover_url text,
  read_date date,
  read_count integer not null default 1 check (read_count >= 1),
  review text,
  insight text,
  tags text[] not null default '{}',
  status text not null default 'done' check (status in ('reading', 'done', 'want')),
  source text not null default 'mylog',
  entry_id uuid references public.entries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_user_id_idx on public.books (user_id);
create index if not exists books_read_date_idx on public.books (user_id, read_date desc);
create index if not exists books_entry_id_idx on public.books (entry_id) where entry_id is not null;
create index if not exists books_status_idx on public.books (user_id, status);

create or replace function public.set_books_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists books_updated_at on public.books;
create trigger books_updated_at
  before update on public.books
  for each row
  execute function public.set_books_updated_at();

alter table public.books enable row level security;

drop policy if exists "books_select_own" on public.books;
drop policy if exists "books_insert_own" on public.books;
drop policy if exists "books_update_own" on public.books;
drop policy if exists "books_delete_own" on public.books;

create policy "books_select_own"
  on public.books for select
  using (auth.uid() = user_id);

create policy "books_insert_own"
  on public.books for insert
  with check (auth.uid() = user_id);

create policy "books_update_own"
  on public.books for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "books_delete_own"
  on public.books for delete
  using (auth.uid() = user_id);

-- Table Editor 지구 아이콘 = anon/authenticated에 Data API 권한이 있음
-- SQL로만 테이블을 만들면 GRANT가 빠져 앱에서 insert/select가 거절될 수 있음
grant all on table public.books to authenticated;
grant all on table public.books to service_role;
grant select, insert, update, delete on table public.books to anon;
