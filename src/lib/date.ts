const KST_TIMEZONE = "Asia/Seoul";

interface KstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getKstParts(date = new Date()): KstParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** YYYY-MM-DD in KST */
export function getKstDateString(date = new Date()): string {
  const p = getKstParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** HH:mm:ss in KST */
export function getKstTimeString(date = new Date()): string {
  const p = getKstParts(date);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:${String(p.second).padStart(2, "0")}`;
}

export function formatKstDateLong(date = new Date()): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function formatKstMonthYear(year: number, month: number): string {
  const date = new Date(`${year}-${String(month).padStart(2, "0")}-01T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "long",
  }).format(date);
}

export function formatKstShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIMEZONE,
    month: "long",
    day: "numeric",
  }).format(date);
}

export function addDaysToKstDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return getKstDateString(date);
}

export function formatTimeForDisplay(time: string | null | undefined): string {
  if (!time) return "--:--";
  const match = String(time).match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : String(time).slice(0, 5);
}

/** HH:mm 또는 HH:mm:ss → DB 저장용 HH:mm:ss (KST 기준 시각 문자열) */
export function normalizeTimeForStorage(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error("시간은 HH:mm 형식으로 입력해주세요. (예: 11:46)");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] != null ? Number(match[3]) : 0;

  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error("유효하지 않은 시간입니다.");
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

export function moodScoreToEmoji(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "📝";
  if (score >= 8) return "😊";
  if (score >= 6) return "🙂";
  if (score >= 4) return "😐";
  return "😓";
}

export function moodScoreToLabel(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "기록 없음";
  if (score >= 8) return "매우 좋음";
  if (score >= 6) return "좋음";
  if (score >= 4) return "보통";
  return "나쁨";
}

/** @deprecated use getKstDateString */
export const getLocalDateString = getKstDateString;
/** @deprecated use getKstTimeString */
export const getLocalTimeString = getKstTimeString;
