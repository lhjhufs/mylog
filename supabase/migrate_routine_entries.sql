-- entries에 [루틴] 태그가 포함된 기록 → detected_routines로 이전
-- Supabase SQL Editor에서 로그인한 사용자 전체에 대해 1회 실행

INSERT INTO public.detected_routines (user_id, name, frequency, is_confirmed, detected_at)
SELECT DISTINCT ON (e.user_id, lower(trim(regexp_replace(e.raw_input, '\[루틴\]', '', 'gi'))))
  e.user_id,
  trim(regexp_replace(e.raw_input, '\[루틴\]', '', 'gi')) AS name,
  COALESCE(e.parsed_data->>'frequency', '매일') AS frequency,
  true AS is_confirmed,
  now() AS detected_at
FROM public.entries e
WHERE e.raw_input ~* '\[루틴\]'
  AND trim(regexp_replace(e.raw_input, '\[루틴\]', '', 'gi')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.detected_routines dr
    WHERE dr.user_id = e.user_id
      AND lower(trim(dr.name)) = lower(trim(regexp_replace(e.raw_input, '\[루틴\]', '', 'gi')))
  )
ORDER BY
  e.user_id,
  lower(trim(regexp_replace(e.raw_input, '\[루틴\]', '', 'gi'))),
  e.created_at DESC;
