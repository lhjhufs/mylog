import { requireUserId, withTimeout } from "@/lib/auth";
import { addDaysToKstDateString, getKstDateString, getKstParts } from "@/lib/date";
import type { EntryRecord } from "@/lib/entries";
import type { DetectedRoutine } from "@/lib/routines";

export function isReadingRoutineName(name: string): boolean {
  return /독서|책\s*읽|리딩|reading/i.test(name);
}
import { supabase } from "@/lib/supabase";

export type BookStatus = "reading" | "done" | "want";

export interface BookRecord {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  cover_url: string | null;
  read_date: string | null;
  read_count: number;
  review: string | null;
  insight: string | null;
  tags: string[];
  status: BookStatus;
  source: string;
  entry_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookParsedFields {
  title: string;
  author: string | null;
  review: string | null;
}

const BOOK_ACTION_PATTERN =
  /읽(었|음|다|을|는|기|어)|다\s*읽|독서|책\s*(읽|완독|정리)|완독|리딩|reading/i;

const BOOK_CONTEXT_PATTERN = /책|도서|소설|에세이|만화책|전집|자기계발서|경제서|역사서/i;

export function looksLikeBookInput(rawInput: string): boolean {
  const text = rawInput.trim();
  if (!text) return false;
  if (BOOK_ACTION_PATTERN.test(text)) return true;
  return BOOK_CONTEXT_PATTERN.test(text) && /읽|독서|완독|끝/.test(text);
}

export function extractBookFromParsedData(
  parsed: Record<string, unknown>,
  rawInput?: string,
): BookParsedFields | null {
  const title =
    (typeof parsed.title === "string" ? parsed.title : null) ??
    (typeof parsed.book_title === "string" ? parsed.book_title : null);
  const author =
    typeof parsed.author === "string"
      ? parsed.author.trim() || null
      : typeof parsed.book_author === "string"
        ? parsed.book_author.trim() || null
        : null;
  const review =
    typeof parsed.review === "string"
      ? parsed.review.trim() || null
      : typeof parsed.book_review === "string"
        ? parsed.book_review.trim() || null
        : null;

  if (title?.trim()) {
    return { title: title.trim(), author, review };
  }

  if (rawInput && looksLikeBookInput(rawInput)) {
    const fallbackTitle = rawInput
      .replace(/^(오늘|방금|어제|아침|점심|저녁)\s+/g, "")
      .replace(/\s*(읽었(어|다|음)?|읽음|다\s*읽었(어|다|음)?|완독|독서)\s*\.?$/g, "")
      .replace(/[《》「」『』]/g, "")
      .trim();
    if (fallbackTitle.length >= 2) {
      return { title: fallbackTitle.slice(0, 200), author: null, review };
    }
  }

  return null;
}

export function normalizeBookParsedData(
  parsed: Record<string, unknown>,
  rawInput: string,
): Record<string, unknown> {
  const book = extractBookFromParsedData(parsed, rawInput);
  if (!book) return parsed;
  return {
    ...parsed,
    title: book.title,
    author: book.author,
    review: book.review,
  };
}

/** 독서 루틴 자동 매칭 (Gemini가 안 채운 경우) */
export function matchReadingRoutine(
  confirmedRoutines: DetectedRoutine[],
): { id: string; name: string } | null {
  const reading = confirmedRoutines.filter((r) => r.is_confirmed && isReadingRoutineName(r.name));
  if (reading.length === 1) {
    return { id: reading[0].id, name: reading[0].name };
  }
  return null;
}

export function getKstMonthDateRange(date = new Date()): { start: string; end: string } {
  const p = getKstParts(date);
  const start = `${p.year}-${String(p.month).padStart(2, "0")}-01`;
  const nextMonthStart =
    p.month === 12
      ? `${p.year + 1}-01-01`
      : `${p.year}-${String(p.month + 1).padStart(2, "0")}-01`;
  const end = addDaysToKstDateString(nextMonthStart, -1);
  return { start, end };
}

export async function countBooksDoneThisMonth(userId: string): Promise<number> {
  const { start, end } = getKstMonthDateRange();

  const { count, error } = await withTimeout(
    supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "done")
      .gte("read_date", start)
      .lte("read_date", end),
    15000,
    "이번 달 독서량 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`독서량 조회 실패: ${error.message}`);
  }

  return count ?? 0;
}

export async function loadUserBooks(userId: string): Promise<BookRecord[]> {
  const { data, error } = await withTimeout(
    supabase
      .from("books")
      .select("*")
      .eq("user_id", userId)
      .order("read_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    15000,
    "책 목록 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`책 목록 조회 실패: ${error.message}`);
  }

  return (data ?? []) as BookRecord[];
}

export async function saveBookFromAnalysis(
  userId: string,
  entry: EntryRecord,
  parsed: Record<string, unknown>,
): Promise<BookRecord | null> {
  const book = extractBookFromParsedData(parsed, entry.raw_input);
  if (!book) return null;

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t): t is string => typeof t === "string")
    : [];

  const row = {
    user_id: userId,
    title: book.title,
    author: book.author,
    publisher: typeof parsed.publisher === "string" ? parsed.publisher : null,
    isbn: typeof parsed.isbn === "string" ? parsed.isbn : null,
    cover_url: typeof parsed.cover_url === "string" ? parsed.cover_url : null,
    read_date: entry.date ?? getKstDateString(),
    read_count: 1,
    review: book.review,
    insight: typeof parsed.insight === "string" ? parsed.insight : null,
    tags,
    status: "done" as BookStatus,
    source: "mylog",
    entry_id: entry.id,
  };

  const { data: existing } = await withTimeout(
    supabase.from("books").select("id").eq("entry_id", entry.id).maybeSingle(),
    15000,
    "책 조회 시간이 초과되었습니다.",
  );

  if (existing?.id) {
    const { data, error } = await withTimeout(
      supabase.from("books").update(row).eq("id", existing.id).select("*").single(),
      15000,
      "책 업데이트 시간이 초과되었습니다.",
    );
    if (error) throw new Error(`책 업데이트 실패: ${error.message}`);
    return (data as BookRecord) ?? null;
  }

  const { data, error } = await withTimeout(
    supabase.from("books").insert(row).select("*").single(),
    15000,
    "책 저장 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`책 저장 실패: ${error.message}`);
  }

  return (data as BookRecord) ?? null;
}

export async function updateBook(
  bookId: string,
  input: { review?: string | null; insight?: string | null },
): Promise<BookRecord> {
  const userId = await requireUserId();
  const updates: Record<string, string | null> = {};
  if (input.review !== undefined) updates.review = input.review;
  if (input.insight !== undefined) updates.insight = input.insight;

  const { data, error } = await withTimeout(
    supabase
      .from("books")
      .update(updates)
      .eq("id", bookId)
      .eq("user_id", userId)
      .select("*")
      .single(),
    15000,
    "책 수정 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`책 수정 실패: ${error.message}`);
  }
  if (!data) {
    throw new Error("책 수정 후 데이터를 불러오지 못했습니다.");
  }

  return data as BookRecord;
}
