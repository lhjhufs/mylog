import { withTimeout } from "@/lib/auth";
import { normalizeRoutineName, parseRoutineName } from "@/lib/routineTag";
import { supabase } from "@/lib/supabase";

export interface DetectedRoutine {
  id: string;
  user_id: string;
  name: string;
  frequency: string;
  detected_at: string;
  is_confirmed: boolean;
  created_at: string;
}

export async function loadDetectedRoutines(userId: string): Promise<DetectedRoutine[]> {
  const { data, error } = await withTimeout(
    supabase
      .from("detected_routines")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    15000,
    "루틴 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 조회 실패: ${error.message}`);
  }

  return (data ?? []) as DetectedRoutine[];
}

export async function saveConfirmedRoutineFromTag(
  userId: string,
  rawInput: string,
  frequency = "매일",
): Promise<DetectedRoutine> {
  const name = parseRoutineName(rawInput);
  if (!name) {
    throw new Error("루틴 이름을 입력해주세요. 예: [루틴] 아침 운동 30분");
  }

  const existing = await loadDetectedRoutines(userId);
  const normalized = normalizeRoutineName(name);
  const found = existing.find((r) => normalizeRoutineName(r.name) === normalized);

  if (found) {
    const { data, error } = await withTimeout(
      supabase
        .from("detected_routines")
        .update({ is_confirmed: true, frequency })
        .eq("id", found.id)
        .select("*")
        .single(),
      15000,
      "루틴 업데이트 시간이 초과되었습니다.",
    );

    if (error) {
      throw new Error(`루틴 업데이트 실패: ${error.message}`);
    }
    if (!data) {
      throw new Error("루틴 업데이트 후 데이터를 불러오지 못했습니다.");
    }
    return data as DetectedRoutine;
  }

  const { data, error } = await withTimeout(
    supabase
      .from("detected_routines")
      .insert({
        user_id: userId,
        name,
        frequency,
        is_confirmed: true,
        detected_at: new Date().toISOString(),
      })
      .select("*")
      .single(),
    15000,
    "루틴 저장 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 저장 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("루틴 저장 후 데이터를 불러오지 못했습니다.");
  }

  return data as DetectedRoutine;
}

export async function confirmDetectedRoutine(id: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.from("detected_routines").update({ is_confirmed: true }).eq("id", id),
    15000,
    "루틴 등록 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 등록 실패: ${error.message}`);
  }
}

export async function dismissDetectedRoutine(id: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.from("detected_routines").delete().eq("id", id),
    15000,
    "루틴 무시 처리 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 무시 실패: ${error.message}`);
  }
}

export async function createConfirmedRoutine(
  userId: string,
  name: string,
  frequency = "매일",
): Promise<DetectedRoutine> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("루틴 이름을 입력해주세요.");
  }

  const { data, error } = await withTimeout(
    supabase
      .from("detected_routines")
      .insert({
        user_id: userId,
        name: trimmed,
        frequency,
        is_confirmed: true,
        detected_at: new Date().toISOString(),
      })
      .select("*")
      .single(),
    15000,
    "루틴 추가 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 추가 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("루틴 추가 후 데이터를 불러오지 못했습니다.");
  }

  return data as DetectedRoutine;
}

export async function updateDetectedRoutine(
  id: string,
  input: { name?: string; frequency?: string },
): Promise<DetectedRoutine> {
  const updates: Record<string, string> = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("루틴 이름을 입력해주세요.");
    updates.name = trimmed;
  }
  if (input.frequency !== undefined) {
    updates.frequency = input.frequency.trim() || "매일";
  }

  const { data, error } = await withTimeout(
    supabase.from("detected_routines").update(updates).eq("id", id).select("*").single(),
    15000,
    "루틴 수정 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 수정 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("루틴 수정 후 데이터를 불러오지 못했습니다.");
  }

  return data as DetectedRoutine;
}

/** 설정에서 삭제 시 소프트 삭제 */
export async function softDeleteDetectedRoutine(id: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.from("detected_routines").update({ is_confirmed: false }).eq("id", id),
    15000,
    "루틴 삭제 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 삭제 실패: ${error.message}`);
  }
}

export async function loadConfirmedRoutines(userId: string): Promise<DetectedRoutine[]> {
  const all = await loadDetectedRoutines(userId);
  return all.filter((r) => r.is_confirmed);
}
