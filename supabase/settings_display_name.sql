-- settings 테이블에 표시 이름 컬럼 추가 (Supabase SQL Editor에서 실행)
alter table public.settings
  add column if not exists display_name text;
