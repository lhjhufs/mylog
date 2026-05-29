import { withTimeout } from "@/lib/auth";
import { isRoutineTaggedInput, parseRoutineName } from "@/lib/routineTag";
import { loadDetectedRoutines, saveConfirmedRoutineFromTag } from "@/lib/routines";
import { supabase } from "@/lib/supabase";

/**
 * entries.raw_input에 [루틴] 태그가 있는 기록을 detected_routines로 이전 (멱등).
 */
export async function migrateRoutineEntriesFromEntries(userId: string): Promise<number> {
  const { data: entries, error } = await withTimeout(
    supabase
      .from("entries")
      .select("raw_input, parsed_data")
      .eq("user_id", userId)
      .ilike("raw_input", "%[루틴]%"),
    20000,
    "루틴 마이그레이션 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 마이그레이션 실패: ${error.message}`);
  }

  if (!entries?.length) return 0;

  const existing = await loadDetectedRoutines(userId);
  const existingNames = new Set(
    existing.map((r) => r.name.trim().toLowerCase()),
  );

  let migrated = 0;
  const seen = new Set<string>();

  for (const row of entries) {
    const rawInput = row.raw_input as string;
    if (!isRoutineTaggedInput(rawInput)) continue;

    const name = parseRoutineName(rawInput);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key) || existingNames.has(key)) continue;
    seen.add(key);

    const parsed = (row.parsed_data ?? {}) as Record<string, unknown>;
    const frequency =
      typeof parsed.frequency === "string" && parsed.frequency.trim()
        ? parsed.frequency
        : "매일";

    await saveConfirmedRoutineFromTag(userId, rawInput, frequency);
    existingNames.add(key);
    migrated++;
  }

  if (import.meta.env.DEV && migrated > 0) {
    console.info(`[mylog] 루틴 마이그레이션 완료: ${migrated}건`);
  }

  return migrated;
}
