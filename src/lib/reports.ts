import { withTimeout } from "@/lib/auth";
import { addDaysToKstDateString, getKstDateString } from "@/lib/date";
import { supabase } from "@/lib/supabase";

export interface AiReport {
  id: string;
  user_id: string;
  date: string;
  calories_total: number | null;
  mood_average: number | null;
  mood_summary: string | null;
  pattern_alerts: unknown;
  created_at: string;
}

export async function loadAiReportForDate(userId: string, date: string): Promise<AiReport | null> {
  const { data, error } = await withTimeout(
    supabase.from("ai_reports").select("*").eq("user_id", userId).eq("date", date).maybeSingle(),
    15000,
    "분석 리포트 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`분석 리포트 조회 실패: ${error.message}`);
  }

  return (data as AiReport | null) ?? null;
}

export async function loadWeekAiReports(userId: string): Promise<AiReport[]> {
  const today = getKstDateString();
  const weekStart = addDaysToKstDateString(today, -6);

  const { data, error } = await withTimeout(
    supabase
      .from("ai_reports")
      .select("*")
      .eq("user_id", userId)
      .gte("date", weekStart)
      .lte("date", today)
      .order("date", { ascending: true }),
    15000,
    "주간 분석 조회 시간이 초과되었습니다.",
  );

  if (error) {
    throw new Error(`주간 분석 조회 실패: ${error.message}`);
  }

  return (data ?? []) as AiReport[];
}

export function parsePatternAlerts(alerts: unknown): string[] {
  if (Array.isArray(alerts)) {
    return alerts.map((item) => String(item)).filter(Boolean);
  }
  if (typeof alerts === "string" && alerts.trim()) {
    return [alerts];
  }
  return [];
}
