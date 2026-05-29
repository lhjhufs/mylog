-- entries.category enum에 'book' 추가 (필수)
-- 오류: invalid input value for enum entry_category: "book"
-- Supabase SQL Editor에서 실행

ALTER TYPE public.entry_category ADD VALUE IF NOT EXISTS 'book';
