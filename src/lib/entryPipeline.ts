import { requireUserId, withTimeout } from "@/lib/auth";
import { getKstDateString, getKstTimeString } from "@/lib/date";
import type { EntryCategory, EntryRecord } from "@/lib/entries";
import { getGeminiApiKeyForUser } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { isRoutineTaggedInput } from "@/lib/routineTag";
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
import { saveBookFromAnalysis } from "@/lib/books";
import { isRetryExhaustedError, MAX_503_RETRIES, RETRY_DELAY_MS, sleep } from "@/lib/retry";

export interface AnalyzeEntryResult {
  entry: EntryRecord;
  savedRoutine?: DetectedRoutine;
}

export function isAnalysisRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    isRetryExhaustedError(error) ||
    /503|overload|시간이 초과|fetch|network|cors/i.test(error.message)
  );
}

/** raw_input만 먼저 저장 (분석 전) */
export async function createEntryRaw(rawInput: string): Promise<EntryRecord> {
  const userId = await requireUserId();
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("내용을 입력해주세요.");
  }

  const now = new Date();
  const rowToInsert = {
    user_id: userId,
    date: getKstDateString(now),
    time: getKstTimeString(now),
    raw_input: trimmed,
    category: "etc" as EntryCategory,
    parsed_data: { analysis_status: "pending", source: "optimistic" },
    emotion: null,
    mood_score: null,
  };

  const { data, error } = await withTimeout(
    supabase.from("entries").insert(rowToInsert).select("*").single(),
    15000,
    "entries 저장 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`entries 저장 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("entries 저장 후 데이터를 불러오지 못했습니다.");
  }

  return data as EntryRecord;
}

/** Gemini 분석 후 entries 행 업데이트 */
export async function analyzeAndUpdateEntry(
  entryId: string,
  rawInput: string,
): Promise<AnalyzeEntryResult> {
  const userId = await requireUserId();
  const isRoutineTag = isRoutineTaggedInput(rawInput);

  let savedRoutine: DetectedRoutine | undefined;
  if (isRoutineTag) {
    savedRoutine = await saveConfirmedRoutineFromTag(userId, rawInput, "매일");
  }

  const apiKey = await getGeminiApiKeyForUser(userId);
  const confirmedRoutines = await loadConfirmedRoutines(userId);

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

  const { data, error } = await withTimeout(
    supabase
      .from("entries")
      .update({
        category: analysis.category,
        parsed_data: { ...analysis.parsed_data, analysis_status: "complete" },
        emotion: analysis.emotion,
        mood_score: analysis.mood_score,
      })
      .eq("id", entryId)
      .eq("user_id", userId)
      .select("*")
      .single(),
    15000,
    "기록 분석 반영 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`기록 업데이트 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("분석 반영 후 데이터를 불러오지 못했습니다.");
  }

  const entry = data as EntryRecord;

  if (analysis.category === "book") {
    try {
      const savedBook = await saveBookFromAnalysis(userId, entry, analysis.parsed_data);
      if (savedBook) {
        analysis.parsed_data = { ...analysis.parsed_data, book_id: savedBook.id };
        await supabase
          .from("entries")
          .update({ parsed_data: { ...analysis.parsed_data, analysis_status: "complete" } })
          .eq("id", entryId)
          .eq("user_id", userId);
      }
    } catch (bookError) {
      if (import.meta.env.DEV) {
        console.warn("[mylog] books 저장 실패:", bookError);
      }
    }
  }

  if (!isRoutineTag) {
    const allRoutines = await loadDetectedRoutines(userId);
    await detectAndSaveRoutineSuggestions(userId, apiKey, allRoutines);
  }

  return { entry, savedRoutine };
}

export async function markEntryAnalysisFailed(entryId: string): Promise<EntryRecord> {
  const userId = await requireUserId();

  const { data: existing, error: fetchError } = await withTimeout(
    supabase.from("entries").select("parsed_data").eq("id", entryId).eq("user_id", userId).single(),
    15000,
    "기록 조회 시간이 초과되었습니다.",
  );

  if (fetchError) {
    throw new Error(`기록 조회 실패: ${fetchError.message}`);
  }

  const parsed =
    existing?.parsed_data && typeof existing.parsed_data === "object"
      ? (existing.parsed_data as Record<string, unknown>)
      : {};

  const { data, error } = await withTimeout(
    supabase
      .from("entries")
      .update({
        parsed_data: { ...parsed, analysis_status: "failed" },
      })
      .eq("id", entryId)
      .eq("user_id", userId)
      .select("*")
      .single(),
    15000,
    "기록 상태 업데이트 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`기록 상태 업데이트 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("기록 상태 업데이트 후 데이터를 불러오지 못했습니다.");
  }

  return data as EntryRecord;
}

/** 3초 간격 자동 재시도 최대 3번 + Gemini 내부 503 재시도 */
export async function analyzeAndUpdateEntryWithRetry(
  entryId: string,
  rawInput: string,
): Promise<AnalyzeEntryResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_503_RETRIES; attempt++) {
    try {
      return await analyzeAndUpdateEntry(entryId, rawInput);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_503_RETRIES && isAnalysisRetryableError(error)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("분석에 실패했습니다.");
}
