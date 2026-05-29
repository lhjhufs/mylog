import { requireUserId, withTimeout } from "@/lib/auth";
import type { EntryRecord } from "@/lib/entries";
import type { BookRecord } from "@/lib/books";
import type { DetectedRoutine } from "@/lib/routines";
import type { AiReport } from "@/lib/reports";
import { supabase } from "@/lib/supabase";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function loadAllEntries(userId: string): Promise<EntryRecord[]> {
  const { data, error } = await withTimeout(
    supabase
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("time", { ascending: false }),
    30000,
    "entries 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`entries 조회 실패: ${error.message}`);
  }

  return (data ?? []) as EntryRecord[];
}

async function loadAllRoutines(userId: string): Promise<DetectedRoutine[]> {
  const { data, error } = await withTimeout(
    supabase.from("detected_routines").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    30000,
    "루틴 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`루틴 조회 실패: ${error.message}`);
  }

  return (data ?? []) as DetectedRoutine[];
}

async function loadAllBooks(userId: string): Promise<BookRecord[]> {
  const { data, error } = await withTimeout(
    supabase.from("books").select("*").eq("user_id", userId).order("read_date", { ascending: false }),
    30000,
    "books 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`books 조회 실패: ${error.message}`);
  }

  return (data ?? []) as BookRecord[];
}

async function loadAllAiReports(userId: string): Promise<AiReport[]> {
  const { data, error } = await withTimeout(
    supabase.from("ai_reports").select("*").eq("user_id", userId).order("date", { ascending: false }),
    30000,
    "ai_reports 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`ai_reports 조회 실패: ${error.message}`);
  }

  return (data ?? []) as AiReport[];
}

export async function downloadUserDataJson(): Promise<void> {
  const userId = await requireUserId();
  const [entries, detected_routines, ai_reports, books] = await Promise.all([
    loadAllEntries(userId),
    loadAllRoutines(userId),
    loadAllAiReports(userId),
    loadAllBooks(userId),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    entries,
    detected_routines,
    ai_reports,
    books,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `mylog-backup-${date}.json`);
}

export async function downloadEntriesCsv(): Promise<void> {
  const userId = await requireUserId();
  const entries = await loadAllEntries(userId);

  const headers = [
    "id",
    "date",
    "time",
    "raw_input",
    "category",
    "emotion",
    "mood_score",
    "parsed_data",
    "created_at",
  ];

  const rows = entries.map((entry) =>
    [
      entry.id,
      entry.date,
      entry.time,
      entry.raw_input,
      entry.category,
      entry.emotion ?? "",
      entry.mood_score ?? "",
      JSON.stringify(entry.parsed_data ?? {}),
      entry.created_at,
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `mylog-entries-${date}.csv`);
}
