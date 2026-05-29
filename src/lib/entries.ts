import { requireUserId, withTimeout } from "@/lib/auth";
import {
  formatTimeForDisplay,
  getKstDateString,
  getKstTimeString,
  normalizeTimeForStorage,
} from "@/lib/date";
import { getGeminiApiKeyForUser } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { isRoutineTaggedInput, parseRoutineName } from "@/lib/routineTag";
import {
  analyzeRoutineRegistration,
  analyzeWithRoutineMatching,
  detectAndSaveRoutineSuggestions,
} from "@/lib/routineAnalysis";
import {
  loadConfirmedRoutines,
  loadDetectedRoutines,
  saveConfirmedRoutineFromTag,
  type DetectedRoutine,
} from "@/lib/routines";

export type EntryCategory =
  | "meal"
  | "exercise"
  | "activity"
  | "idea"
  | "sleep"
  | "schedule"
  | "routine"
  | "etc";

export interface EntryRecord {
  id: string;
  user_id: string;
  date: string;
  time: string;
  raw_input: string;
  category: EntryCategory;
  parsed_data: Record<string, unknown>;
  emotion: string | null;
  mood_score: number | null;
  created_at: string;
}

export type TimelineEntryStatus = "analyzing" | "analysis_failed" | "ready";

export interface TimelineEntryView {
  id: string;
  time: string;
  category: "식사" | "운동" | "활동" | "아이디어" | "수면" | "일정" | "루틴" | "기타";
  content: string;
  emotion?: string;
  /** optimistic UI 상태 */
  status?: TimelineEntryStatus;
  /** Supabase 저장 전 임시 id */
  isOptimistic?: boolean;
}

const CATEGORY_TO_KOREAN: Record<EntryCategory, TimelineEntryView["category"]> = {
  meal: "식사",
  exercise: "운동",
  activity: "활동",
  idea: "아이디어",
  sleep: "수면",
  schedule: "일정",
  routine: "루틴",
  etc: "기타",
};

function logStep(step: string, detail?: unknown) {
  if (import.meta.env.DEV) {
    console.info(`[mylog] ${step}`, detail ?? "");
  }
}

export async function loadTodayEntries(userId: string): Promise<EntryRecord[]> {
  const date = getKstDateString();
  const { data, error } = await withTimeout(
    supabase.from("entries").select("*").eq("user_id", userId).eq("date", date).order("time", {
      ascending: true,
    }),
    15000,
    "entries 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`entries 조회 실패: ${error.message}`);
  }

  return (data ?? []) as EntryRecord[];
}

export interface CreateEntryResult {
  entry: EntryRecord;
  savedRoutine?: DetectedRoutine;
}

export async function createEntryWithGemini(rawInput: string): Promise<CreateEntryResult> {
  logStep("1/5 세션 확인");
  const userId = await requireUserId();

  const isRoutineTag = isRoutineTaggedInput(rawInput);

  // [루틴] 태그: Gemini 전에 먼저 detected_routines 저장 → 사이드바 즉시 반영
  let savedRoutine: DetectedRoutine | undefined;
  if (isRoutineTag) {
    logStep("2/5 [루틴] 태그 → detected_routines 선저장");
    savedRoutine = await saveConfirmedRoutineFromTag(userId, rawInput, "매일");
  }

  logStep("3/5 Gemini API 키 조회");
  const apiKey = await getGeminiApiKeyForUser(userId);

  const confirmedRoutines = await loadConfirmedRoutines(userId);

  logStep("4/5 Gemini 분석", { input: rawInput, isRoutineTag });
  const analysis = isRoutineTag
    ? await analyzeRoutineRegistration(rawInput, apiKey)
    : await analyzeWithRoutineMatching(rawInput, apiKey, confirmedRoutines);

  if (isRoutineTag && savedRoutine) {
    const frequency =
      typeof analysis.parsed_data.frequency === "string"
        ? analysis.parsed_data.frequency
        : "매일";
    if (frequency !== savedRoutine.frequency) {
      savedRoutine = await saveConfirmedRoutineFromTag(userId, rawInput, frequency);
    }
  }

  logStep("4/5 분석 완료", analysis);

  const now = new Date();
  const rowToInsert = {
    user_id: userId,
    date: getKstDateString(now),
    time: getKstTimeString(now),
    raw_input: rawInput,
    category: analysis.category,
    parsed_data: analysis.parsed_data,
    emotion: analysis.emotion,
    mood_score: analysis.mood_score,
  };

  logStep("5/5 entries 저장", rowToInsert);
  const { data, error } = await withTimeout(
    supabase.from("entries").insert(rowToInsert).select("*").single(),
    15000,
    "entries 저장 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`entries 저장 실패: ${error.message}`);
  }

  if (!data) {
    const rows = await loadTodayEntries(userId);
    const latest = rows.filter((r) => r.raw_input === rawInput).at(-1);
    if (latest) return latest;
    throw new Error("entries 저장은 되었을 수 있으나 조회에 실패했습니다.");
  }

  logStep("5/5 entries 저장 완료", { id: data.id });

  if (!isRoutineTag) {
    logStep("6/5 반복 패턴 루틴 감지");
    const allRoutines = await loadDetectedRoutines(userId);
    await detectAndSaveRoutineSuggestions(userId, apiKey, allRoutines);
  }

  return { entry: data as EntryRecord, savedRoutine };
}

/** Gemini 없이 시간·내용만 직접 저장 */
export async function createEntryManual(input: {
  time: string;
  raw_input: string;
}): Promise<EntryRecord> {
  const userId = await requireUserId();
  const raw_input = input.raw_input.trim();
  if (!raw_input) {
    throw new Error("내용을 입력해주세요.");
  }

  const time = normalizeTimeForStorage(input.time);
  const rowToInsert = {
    user_id: userId,
    date: getKstDateString(),
    time,
    raw_input,
    category: "etc" as EntryCategory,
    parsed_data: { source: "manual" },
    emotion: "중립",
    mood_score: 5,
  };

  const { data, error } = await withTimeout(
    supabase.from("entries").insert(rowToInsert).select("*").single(),
    15000,
    "기록 저장 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`기록 저장 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("기록 저장 후 데이터를 불러오지 못했습니다.");
  }

  return data as EntryRecord;
}

export async function updateEntry(
  entryId: string,
  input: { time: string; raw_input: string },
): Promise<EntryRecord> {
  const userId = await requireUserId();
  const raw_input = input.raw_input.trim();
  if (!raw_input) {
    throw new Error("내용을 입력해주세요.");
  }

  const time = normalizeTimeForStorage(input.time);

  const { data, error } = await withTimeout(
    supabase
      .from("entries")
      .update({ time, raw_input })
      .eq("id", entryId)
      .eq("user_id", userId)
      .select("*")
      .single(),
    15000,
    "기록 수정 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`기록 수정 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("기록 수정 후 데이터를 불러오지 못했습니다.");
  }

  return data as EntryRecord;
}

export async function deleteEntry(entryId: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await withTimeout(
    supabase.from("entries").delete().eq("id", entryId).eq("user_id", userId),
    15000,
    "기록 삭제 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`기록 삭제 실패: ${error.message}`);
  }
}

function resolveTimelineStatus(entry: EntryRecord): TimelineEntryStatus {
  const parsed = (entry.parsed_data ?? {}) as Record<string, unknown>;
  const status = parsed.analysis_status;
  if (status === "pending" || status === "analyzing") return "analyzing";
  if (status === "failed") return "analysis_failed";
  return "ready";
}

export function toTimelineEntry(
  entry: EntryRecord,
  overrides?: Partial<TimelineEntryView>,
): TimelineEntryView {
  return {
    id: entry.id,
    time: formatTimeForDisplay(entry.time),
    category: CATEGORY_TO_KOREAN[entry.category] ?? "기타",
    content: entry.raw_input,
    emotion: entry.emotion ?? undefined,
    status: resolveTimelineStatus(entry),
    ...overrides,
  };
}

export function createOptimisticTimelineEntry(
  tempId: string,
  rawInput: string,
  time?: string,
): TimelineEntryView {
  return {
    id: tempId,
    time: time ?? formatTimeForDisplay(getKstTimeString()),
    category: "기타",
    content: rawInput,
    status: "analyzing",
    isOptimistic: true,
  };
}

export function sortTimelineEntries(entries: TimelineEntryView[]): TimelineEntryView[] {
  return [...entries].sort((a, b) => a.time.localeCompare(b.time));
}
