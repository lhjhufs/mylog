import { addDaysToKstDateString, getKstDateString } from "@/lib/date";
import { generateGeminiJson } from "@/lib/gemini";
import type { EntryCategory } from "@/lib/entries";
import { looksLikeMealInput, normalizeMealParsedData } from "@/lib/meals";
import { isRoutineTaggedInput, normalizeRoutineName, parseRoutineName } from "@/lib/routineTag";
import type { DetectedRoutine } from "@/lib/routines";
import { withTimeout } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export interface EntryAnalysis {
  category: EntryCategory;
  emotion: string;
  mood_score: number;
  parsed_data: Record<string, unknown>;
  matched_routine_id: string | null;
  matched_routine_name: string | null;
}

const ALLOWED_CATEGORIES = new Set<EntryCategory>([
  "meal",
  "exercise",
  "activity",
  "idea",
  "sleep",
  "schedule",
  "routine",
  "etc",
]);

function normalizeAnalysis(payload: Record<string, unknown>): EntryAnalysis {
  const categoryRaw = String(payload.category ?? "etc") as EntryCategory;
  const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : "etc";
  const emotion = typeof payload.emotion === "string" ? payload.emotion : "중립";

  let mood = Number(payload.mood_score ?? 5);
  if (Number.isNaN(mood)) mood = 5;
  mood = Math.max(1, Math.min(10, mood));

  const parsedData =
    payload.parsed_data && typeof payload.parsed_data === "object"
      ? (payload.parsed_data as Record<string, unknown>)
      : {};

  const matchedId =
    typeof payload.matched_routine_id === "string" ? payload.matched_routine_id : null;
  const matchedName =
    typeof payload.matched_routine_name === "string" ? payload.matched_routine_name : null;

  const analysis: EntryAnalysis = {
    category,
    emotion,
    mood_score: mood,
    parsed_data: parsedData,
    matched_routine_id: matchedId,
    matched_routine_name: matchedName,
  };

  return analysis;
}

function applyMealHeuristics(analysis: EntryAnalysis, rawInput: string): EntryAnalysis {
  if (analysis.category === "routine") return analysis;
  if (!looksLikeMealInput(rawInput)) return analysis;

  analysis.category = "meal";
  analysis.parsed_data = normalizeMealParsedData(analysis.parsed_data, rawInput);
  return analysis;
}

function finalizeAnalysis(analysis: EntryAnalysis, rawInput: string): EntryAnalysis {
  analysis = applyMealHeuristics(analysis, rawInput);
  if (analysis.category === "meal") {
    analysis.parsed_data = normalizeMealParsedData(analysis.parsed_data, rawInput);
  }
  return analysis;
}

/** [루틴] 태그로 최초 등록할 때 */
export async function analyzeRoutineRegistration(
  rawInput: string,
  apiKey: string,
): Promise<EntryAnalysis> {
  const routineName = parseRoutineName(rawInput);
  const prompt = `
너는 사용자의 하루 기록을 구조화하는 분석기야.
반드시 JSON 객체 하나만 반환해.

입력: ${rawInput}
이 입력은 [루틴] 태그로 새 루틴을 등록하는 문장이야.

반환 스키마:
{
  "category": "routine",
  "emotion": "감정",
  "mood_score": 1-10,
  "parsed_data": {
    "routine_name": "루틴 이름",
    "frequency": "매일|주 3회 등",
    "duration_minutes": 숫자 또는 생략
  },
  "matched_routine_id": null,
  "matched_routine_name": null
}

규칙:
- category는 반드시 routine
- routine_name은 "${routineName}"
- JSON만 반환
`.trim();

  const payload = await generateGeminiJson<Record<string, unknown>>(apiKey, prompt);
  const analysis = normalizeAnalysis(payload);
  analysis.category = "routine";
  analysis.parsed_data = {
    ...analysis.parsed_data,
    routine_name: routineName,
    source: "user_tag",
  };
  return finalizeAnalysis(analysis, rawInput);
}

/** 등록된 루틴과 자연어 입력 매칭 */
export async function analyzeWithRoutineMatching(
  rawInput: string,
  apiKey: string,
  confirmedRoutines: DetectedRoutine[],
): Promise<EntryAnalysis> {
  const routineListText =
    confirmedRoutines.length > 0
      ? confirmedRoutines
          .map((r) => `- id: ${r.id}, name: "${r.name}"`)
          .join("\n")
      : "(등록된 루틴 없음)";

  const prompt = `
너는 사용자의 하루 기록을 구조화하는 분석기야.
반드시 JSON 객체 하나만 반환해.

입력 문장:
${rawInput}

등록된 루틴 목록:
${routineListText}

반환 스키마:
{
  "category": "meal|exercise|activity|idea|sleep|schedule|routine|etc",
  "emotion": "감정 요약",
  "mood_score": 1-10,
  "parsed_data": {},
  "matched_routine_id": "매칭된 루틴 id 또는 null",
  "matched_routine_name": "매칭된 루틴 이름 또는 null"
}

규칙 (우선순위):
1. 식사·음료 섭취 → category는 반드시 meal
   - "먹음/마심/한 잔" + 음식·음료(빵, 커피, 아메리카노, 라떼, 밥, 면 등)는 무조건 meal
   - 약 복용만 meal이 아님 (예: "아침에 약 먹음" → routine 또는 activity)
   - parsed_data 형식: { "food": "음식1, 음식2", "calories": 합산숫자 }
   - 예: "점심 비빔밥 먹음" → meal, { "food": "비빔밥", "calories": 550 }
   - 예: "두바이 슈크림 빵과 아메리카노 한 잔 먹음" → meal, { "food": "두바이 슈크림 빵, 아메리카노", "calories": 395 }
   - 예: "라떼 한 잔 마셨어" → meal, { "food": "라떼", "calories": 200 }
   - 여러 항목은 food에 쉼표로 나열, calories는 1인분 기준 합산(정수)
2. 등록된 루틴 수행/완료 → category routine, matched_routine_id/name 채움
3. 운동 → exercise_type, duration_minutes
4. 일정 → schedule_time
5. JSON만 반환
`.trim();

  const payload = await generateGeminiJson<Record<string, unknown>>(apiKey, prompt);
  const analysis = normalizeAnalysis(payload);

  if (analysis.matched_routine_id || analysis.matched_routine_name) {
    analysis.category = "routine";
    analysis.parsed_data = {
      ...analysis.parsed_data,
      matched_routine_id: analysis.matched_routine_id,
      matched_routine_name: analysis.matched_routine_name,
      source: "routine_match",
    };
  }

  return finalizeAnalysis(analysis, rawInput);
}

interface RoutineSuggestion {
  name: string;
  frequency: string;
}

/** 3일 이상 반복 활동 → 루틴 등록 제안 */
export async function detectAndSaveRoutineSuggestions(
  userId: string,
  apiKey: string,
  existingRoutines: DetectedRoutine[],
): Promise<void> {
  const today = getKstDateString();
  const start = addDaysToKstDateString(today, -13);

  const { data: entries, error } = await withTimeout(
    supabase
      .from("entries")
      .select("date, raw_input, category")
      .eq("user_id", userId)
      .gte("date", start)
      .order("date", { ascending: true }),
    15000,
    "반복 패턴 조회 시간이 초과되었습니다.",
  );

  if (error || !entries?.length) return;

  const knownNames = new Set(
    existingRoutines.map((r) => normalizeRoutineName(r.name)),
  );

  const entriesSummary = entries
    .map((e) => `${e.date} | ${e.category} | ${e.raw_input}`)
    .join("\n");

  const prompt = `
다음은 사용자의 최근 2주 기록이야.

${entriesSummary}

등록·제안된 루틴 이름:
${existingRoutines.map((r) => r.name).join(", ") || "없음"}

3일 이상 반복된 활동 중, 아직 루틴으로 등록되지 않은 것만 찾아줘.
반드시 JSON만 반환:

{
  "suggestions": [
    { "name": "루틴 이름", "frequency": "매일|주 3회 등" }
  ]
}

없으면 { "suggestions": [] }
`.trim();

  try {
    const result = await generateGeminiJson<{ suggestions: RoutineSuggestion[] }>(apiKey, prompt);
    const suggestions = result.suggestions ?? [];

    for (const suggestion of suggestions) {
      const name = suggestion.name?.trim();
      if (!name) continue;
      const norm = normalizeRoutineName(name);
      if (knownNames.has(norm)) continue;

      const { error: insertError } = await supabase.from("detected_routines").insert({
        user_id: userId,
        name,
        frequency: suggestion.frequency || "매일",
        is_confirmed: false,
        detected_at: new Date().toISOString(),
      });

      if (!insertError) knownNames.add(norm);
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[mylog] 루틴 패턴 감지 실패:", err);
    }
  }
}

export function entryCompletesRoutine(
  entry: { category: string; raw_input: string; parsed_data: Record<string, unknown> },
  routine: DetectedRoutine,
): boolean {
  if (entry.category !== "routine") return false;

  const parsed = entry.parsed_data ?? {};
  if (parsed.matched_routine_id === routine.id) return true;

  const matchedName =
    typeof parsed.matched_routine_name === "string" ? parsed.matched_routine_name : null;
  if (matchedName && normalizeRoutineName(matchedName) === normalizeRoutineName(routine.name)) {
    return true;
  }

  if (isRoutineTaggedInput(entry.raw_input)) {
    const registered = parseRoutineName(entry.raw_input);
    if (normalizeRoutineName(registered) === normalizeRoutineName(routine.name)) return true;
  }

  const entryText = normalizeRoutineName(parseRoutineName(entry.raw_input) || entry.raw_input);
  const target = normalizeRoutineName(routine.name);
  return entryText === target || entryText.includes(target) || target.includes(entryText);
}

export function countCompletedRoutinesToday(
  entries: Array<{
    category: string;
    raw_input: string;
    parsed_data: Record<string, unknown>;
  }>,
  confirmedRoutines: DetectedRoutine[],
): number {
  if (!confirmedRoutines.length) return 0;
  return confirmedRoutines.filter((routine) =>
    entries.some((entry) => entryCompletesRoutine(entry, routine)),
  ).length;
}

export function buildRoutineCompletionMap(
  entries: Array<{
    category: string;
    raw_input: string;
    parsed_data: Record<string, unknown>;
  }>,
  confirmedRoutines: DetectedRoutine[],
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const routine of confirmedRoutines) {
    map[routine.id] = entries.some((entry) => entryCompletesRoutine(entry, routine));
  }
  return map;
}
