import { addDaysToKstDateString, getKstDateString } from '@/lib/date';
import type { PastTodayItem, TodaySummaryView } from '@/lib/dashboard';
import { formatCaloriesKcal } from '@/lib/meals';
import { parsePatternAlerts, type AiReport } from '@/lib/reports';

interface RightPanelProps {
  todayAiReport: AiReport | null;
  weekAiReports: AiReport[];
  todaySummary: TodaySummaryView;
  pastToday: PastTodayItem[];
}

function buildWeekMoodData(reports: AiReport[]) {
  const today = getKstDateString();
  const days: { label: string; value: number; hasData: boolean }[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = addDaysToKstDateString(today, -i);
    const report = reports.find((r) => r.date === date);
    const dateObj = new Date(`${date}T12:00:00+09:00`);
    const label = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      weekday: 'short',
    }).format(dateObj);

    days.push({
      label,
      value: report?.mood_average != null ? Math.round((report.mood_average / 10) * 100) : 0,
      hasData: report?.mood_average != null,
    });
  }

  return days;
}

export function RightPanel({
  todayAiReport,
  weekAiReports,
  todaySummary,
  pastToday,
}: RightPanelProps) {
  const weekMood = buildWeekMoodData(weekAiReports);
  const patternAlerts = parsePatternAlerts(todayAiReport?.pattern_alerts);
  const hasWeekData = weekMood.some((d) => d.hasData);

  return (
    <div className="w-full lg:w-[300px] lg:bg-[#F7F7F5] lg:h-screen">
      <div className="lg:px-6 pt-6 sm:pt-8 pb-8 lg:overflow-y-auto lg:h-full">
        <h2 className="hidden lg:block text-[#1A1A1A] font-semibold text-lg mb-6">오늘 분석</h2>

        <div className="space-y-3 mb-6">
          <div className="bg-white rounded-lg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <div className="text-xs text-[#6B6B6B] mb-1">🔥 칼로리</div>
            <div className="text-lg text-[#1A1A1A] font-medium">
              {todaySummary.calories != null ? formatCaloriesKcal(todaySummary.calories) : '—'}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <div className="text-xs text-[#6B6B6B] mb-1">😊 기분 평균</div>
            <div className="text-lg text-[#1A1A1A] font-medium">
              {todaySummary.moodLabel ?? '—'}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <div className="text-xs text-[#6B6B6B] mb-1">✅ 루틴</div>
            <div className="text-lg text-[#1A1A1A] font-medium">
              {todaySummary.routineTotal > 0
                ? `${todaySummary.routineDone}/${todaySummary.routineTotal}`
                : '—'}
            </div>
          </div>
        </div>

        <div className="h-px bg-[#EEEEEE] my-6" />

        <div className="bg-white rounded-lg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] mb-6">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-2">AI 인사이트</h3>
          <p className="text-sm text-[#1A1A1A] leading-relaxed">
            {todayAiReport?.mood_summary ?? '오늘 분석 리포트가 아직 없습니다.'}
          </p>
        </div>

        <div className="h-px bg-[#EEEEEE] my-6" />

        <div className="mb-6">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">이번 주 기분 트렌드</h3>
          {!hasWeekData ? (
            <p className="text-sm text-[#999999]">주간 기분 데이터가 없습니다.</p>
          ) : (
            <div className="flex items-end justify-between gap-2 h-32">
              {weekMood.map((item) => (
                <div key={item.label} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full bg-black rounded-sm"
                    style={{ height: item.hasData ? `${Math.max(item.value, 8)}%` : '4px' }}
                  />
                  <div className="text-xs text-[#6B6B6B]">{item.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-px bg-[#EEEEEE] my-6" />

        <div className="mb-6">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-3">패턴 알림</h3>
          {patternAlerts.length === 0 ? (
            <p className="text-sm text-[#999999]">패턴 알림이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {patternAlerts.map((alert, index) => (
                <div key={index} className="bg-white rounded-full px-4 py-2 text-sm text-[#1A1A1A]">
                  {alert}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-px bg-[#EEEEEE] my-6" />

        <div>
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-3">과거의 오늘</h3>
          {pastToday.length === 0 ? (
            <p className="text-sm text-[#999999]">과거의 오늘 기록이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {pastToday.map((item) => (
                <div key={item.label}>
                  <div className="text-xs text-[#6B6B6B] mb-1">{item.label}</div>
                  <div className="text-sm text-[#1A1A1A]">{item.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
