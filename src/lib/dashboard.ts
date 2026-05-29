import { withTimeout } from "@/lib/auth";
import {
  addDaysToKstDateString,
  formatKstShortDate,
  getKstDateString,
  moodScoreToEmoji,
  moodScoreToLabel,
} from "@/lib/date";
import type { EntryRecord } from "@/lib/entries";
import { loadTodayEntries } from "@/lib/entries";
import { loadAiReportForDate, loadWeekAiReports, parsePatternAlerts, type AiReport } from "@/lib/reports";
import { buildRoutineCompletionMap, countCompletedRoutinesToday } from "@/lib/routineAnalysis";
import { formatCaloriesInline, sumMealCaloriesFromEntries } from "@/lib/meals";
import { loadDetectedRoutines, type DetectedRoutine } from "@/lib/routines";
import { supabase } from "@/lib/supabase";

export interface RecentLogItem {
  date: string;
  dateLabel: string;
  summary: string;
  mood: string;
}

export interface PastTodayItem {
  label: string;
  summary: string;
}

export interface TodaySummaryView {
  line: string | null;
  calories: number | null;
  moodLabel: string | null;
  routineDone: number;
  routineTotal: number;
}

export interface DashboardData {
  todayEntries: EntryRecord[];
  todayAiReport: AiReport | null;
  weekAiReports: AiReport[];
  confirmedRoutines: DetectedRoutine[];
  unconfirmedRoutines: DetectedRoutine[];
  routineCompletionMap: Record<string, boolean>;
  recentLogs: RecentLogItem[];
  monthMoodByDay: Record<number, string>;
  pastToday: PastTodayItem[];
  todaySummary: TodaySummaryView;
}

function averageMood(entries: EntryRecord[]): number | null {
  const scores = entries.map((e) => e.mood_score).filter((s): s is number => s != null);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function buildTodaySummary(
  entries: EntryRecord[],
  aiReport: AiReport | null,
  confirmedRoutines: DetectedRoutine[],
): TodaySummaryView {
  const calories = sumMealCaloriesFromEntries(entries);
  const moodAvg = aiReport?.mood_average ?? averageMood(entries);
  const moodLabel = aiReport?.mood_summary ?? (moodAvg != null ? moodScoreToLabel(moodAvg) : null);
  const routineDone = countCompletedRoutinesToday(entries, confirmedRoutines);
  const routineTotal = confirmedRoutines.length;

  const parts: string[] = [];
  if (calories != null) parts.push(`칼로리 ${formatCaloriesInline(calories)}`);
  if (moodLabel) parts.push(`😊 ${moodLabel}`);
  if (routineTotal > 0) parts.push(`루틴 ${routineDone}/${routineTotal}`);

  return {
    line: parts.length ? parts.join(" · ") : null,
    calories,
    moodLabel,
    routineDone,
    routineTotal,
  };
}

async function loadRecentLogs(userId: string, today: string): Promise<RecentLogItem[]> {
  const { data, error } = await withTimeout(
    supabase
      .from("entries")
      .select("date, raw_input, emotion, mood_score")
      .eq("user_id", userId)
      .neq("date", today)
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .limit(100),
    15000,
    "최근 기록 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`최근 기록 조회 실패: ${error.message}`);
  }

  const byDate = new Map<string, { summaries: string[]; moods: number[] }>();
  for (const row of data ?? []) {
    const date = row.date as string;
    if (!byDate.has(date)) byDate.set(date, { summaries: [], moods: [] });
    const bucket = byDate.get(date)!;
    bucket.summaries.push(row.raw_input as string);
    const score = row.mood_score as number | null;
    if (score != null) bucket.moods.push(score);
  }

  return Array.from(byDate.entries())
    .slice(0, 5)
    .map(([date, bucket]) => {
      const avgMood = bucket.moods.length
        ? bucket.moods.reduce((a, b) => a + b, 0) / bucket.moods.length
        : null;
      return {
        date,
        dateLabel: formatKstShortDate(date),
        summary: bucket.summaries[0] ?? "",
        mood: moodScoreToEmoji(avgMood),
      };
    });
}

async function loadMonthMoodByDay(
  userId: string,
  year: number,
  month: number,
): Promise<Record<number, string>> {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(`${year}-${String(month).padStart(2, "0")}-01T12:00:00+09:00`);
  lastDay.setMonth(lastDay.getMonth() + 1);
  lastDay.setDate(0);
  const end = getKstDateString(lastDay);

  const { data, error } = await withTimeout(
    supabase
      .from("entries")
      .select("date, mood_score")
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", end),
    15000,
    "캘린더 기록 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`캘린더 기록 조회 실패: ${error.message}`);
  }

  const byDay = new Map<number, number[]>();
  for (const row of data ?? []) {
    const day = Number(String(row.date).split("-")[2]);
    const score = row.mood_score as number | null;
    if (!byDay.has(day)) byDay.set(day, []);
    if (score != null) byDay.get(day)!.push(score);
  }

  const result: Record<number, string> = {};
  for (const [day, scores] of byDay) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    result[day] = moodScoreToEmoji(avg);
  }
  return result;
}

async function loadPastToday(userId: string, today: string): Promise<PastTodayItem[]> {
  const offsets = [
    { days: -7, label: "1주일 전" },
    { days: -30, label: "1개월 전" },
  ];

  const items: PastTodayItem[] = [];

  for (const { days, label } of offsets) {
    const date = addDaysToKstDateString(today, days);
    const report = await loadAiReportForDate(userId, date);
    if (report?.mood_summary) {
      items.push({ label, summary: report.mood_summary });
      continue;
    }

    const { data } = await withTimeout(
      supabase
        .from("entries")
        .select("raw_input")
        .eq("user_id", userId)
        .eq("date", date)
        .order("time", { ascending: true })
        .limit(1),
      15000,
      "과거 기록 조회 시간이 초과되었습니다.",
    );

    if (data?.[0]?.raw_input) {
      items.push({ label, summary: data[0].raw_input as string });
    }
  }

  return items;
}

export async function loadDashboardData(userId: string): Promise<DashboardData> {
  const today = getKstDateString();
  const kst = new Date(`${today}T12:00:00+09:00`);

  const [todayEntries, todayAiReport, weekAiReports, allRoutines, recentLogs, monthMoodByDay, pastToday] =
    await Promise.all([
      loadTodayEntries(userId),
      loadAiReportForDate(userId, today),
      loadWeekAiReports(userId),
      loadDetectedRoutines(userId),
      loadRecentLogs(userId, today),
      loadMonthMoodByDay(userId, kst.getFullYear(), kst.getMonth() + 1),
      loadPastToday(userId, today),
    ]);

  const confirmedRoutines = allRoutines.filter((r) => r.is_confirmed);
  const unconfirmedRoutines = allRoutines.filter((r) => !r.is_confirmed);
  const routineCompletionMap = buildRoutineCompletionMap(todayEntries, confirmedRoutines);
  const todaySummary = buildTodaySummary(todayEntries, todayAiReport, confirmedRoutines);

  return {
    todayEntries,
    todayAiReport,
    weekAiReports,
    confirmedRoutines,
    unconfirmedRoutines,
    routineCompletionMap,
    recentLogs,
    monthMoodByDay,
    pastToday,
    todaySummary,
  };
}

export async function loadMonthMoodForCalendar(
  userId: string,
  year: number,
  month: number,
): Promise<Record<number, string>> {
  return loadMonthMoodByDay(userId, year, month);
}
