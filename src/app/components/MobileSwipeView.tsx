import { useState, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { CenterTimeline } from './CenterTimeline';
import { RightPanel } from './RightPanel';
import { BottomInputBar } from './BottomInputBar';
import type { TimelineEntryView } from '@/lib/entries';
import type { PastTodayItem, RecentLogItem, TodaySummaryView } from '@/lib/dashboard';
import type { DetectedRoutine } from '@/lib/routines';
import type { AiReport } from '@/lib/reports';

interface MobileSwipeViewProps {
  onSettingsClick: () => void;
  entries: TimelineEntryView[];
  onSubmitEntry: (input: string) => Promise<boolean>;
  onCreateManualEntry: (input: { time: string; content: string }) => Promise<void>;
  onUpdateEntry: (entryId: string, input: { time: string; content: string }) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onRetryAnalysis?: (entryId: string) => void;
  isSubmitting?: boolean;
  submitError?: string;
  dashboardLoadError?: string;
  dataHint?: { email: string; totalEntries: number; todayKst: string } | null;
  todaySummary: TodaySummaryView;
  recentLogs: RecentLogItem[];
  confirmedRoutines: DetectedRoutine[];
  unconfirmedRoutines: DetectedRoutine[];
  routineDone: number;
  routineTotal: number;
  routineCompletionMap: Record<string, boolean>;
  onConfirmRoutineSuggestion?: (id: string) => void;
  onDismissRoutineSuggestion?: (id: string) => void;
  monthMoodByDay: Record<number, string>;
  userId: string | null;
  todayAiReport: AiReport | null;
  weekAiReports: AiReport[];
  pastToday: PastTodayItem[];
  booksReadThisMonth: number;
}

export function MobileSwipeView({
  onSettingsClick,
  entries,
  onSubmitEntry,
  onCreateManualEntry,
  onUpdateEntry,
  onDeleteEntry,
  onRetryAnalysis,
  isSubmitting = false,
  submitError = '',
  dashboardLoadError = '',
  dataHint = null,
  todaySummary,
  recentLogs,
  confirmedRoutines,
  unconfirmedRoutines,
  routineDone,
  routineTotal,
  routineCompletionMap,
  onConfirmRoutineSuggestion,
  onDismissRoutineSuggestion,
  monthMoodByDay,
  userId,
  todayAiReport,
  weekAiReports,
  pastToday,
  booksReadThisMonth,
}: MobileSwipeViewProps) {
  const [currentPanel, setCurrentPanel] = useState(1); // 0: sidebar, 1: timeline, 2: analysis
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0 && currentPanel < 2) {
        // Swipe left - go to next panel
        setCurrentPanel(currentPanel + 1);
      } else if (diff < 0 && currentPanel > 0) {
        // Swipe right - go to previous panel
        setCurrentPanel(currentPanel - 1);
      }
    }
  };

  const getTransform = () => {
    return `translateX(-${currentPanel * 100}%)`;
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Top Header */}
      <div className="fixed top-0 left-0 right-0 bg-white z-30 border-b border-[#F7F7F5]">
        <div className="flex items-center justify-center pt-3 pb-0">
          <h1 className="text-lg font-bold text-[#1A1A1A] leading-tight">마이로그</h1>
        </div>
        {/* Panel Indicator — 탭으로 패널 이동 */}
        <nav
          className="flex justify-center items-center gap-0 pb-2 pt-0.5"
          aria-label="화면 전환"
        >
          {(
            [
              { index: 0, label: '루틴·캘린더' },
              { index: 1, label: '오늘 기록' },
              { index: 2, label: '오늘 분석' },
            ] as const
          ).map(({ index, label }) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentPanel(index)}
              aria-label={label}
              aria-current={currentPanel === index ? 'page' : undefined}
              className="p-1.5 rounded-full hover:bg-[#F7F7F5] transition-colors"
            >
              <span
                className={`block rounded-full transition-all ${
                  currentPanel === index
                    ? 'w-2.5 h-2.5 bg-black'
                    : 'w-2 h-2 bg-[#E5E5E5]'
                }`}
              />
            </button>
          ))}
        </nav>
      </div>

      {/* Swipeable Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden pt-[4.25rem] pb-28"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: getTransform() }}
        >
          {/* Panel 0: Sidebar */}
          <div className="min-w-full h-full overflow-y-auto bg-[#F7F7F5] px-4">
            <Sidebar
              onSettingsClick={onSettingsClick}
              recentLogs={recentLogs}
              confirmedRoutines={confirmedRoutines}
              unconfirmedRoutines={unconfirmedRoutines}
              routineDone={routineDone}
              routineTotal={routineTotal}
              routineCompletionMap={routineCompletionMap}
              onConfirmRoutineSuggestion={onConfirmRoutineSuggestion}
              onDismissRoutineSuggestion={onDismissRoutineSuggestion}
              monthMoodByDay={monthMoodByDay}
              userId={userId}
            />
          </div>

          {/* Panel 1: Timeline */}
          <div className="min-w-full h-full overflow-y-auto bg-white px-4">
            <CenterTimeline
              hideMobileInput={true}
              entries={entries}
              onSubmitEntry={onSubmitEntry}
              onCreateManualEntry={onCreateManualEntry}
              onUpdateEntry={onUpdateEntry}
              onDeleteEntry={onDeleteEntry}
              onRetryAnalysis={onRetryAnalysis}
              isSubmitting={isSubmitting}
              submitError={submitError}
              dashboardLoadError={dashboardLoadError}
              dataHint={dataHint}
              todaySummary={todaySummary}
            />
          </div>

          {/* Panel 2: Analysis */}
          <div className="min-w-full h-full overflow-y-auto bg-[#F7F7F5] px-4">
            <RightPanel
              todayAiReport={todayAiReport}
              weekAiReports={weekAiReports}
              todaySummary={todaySummary}
              pastToday={pastToday}
              booksReadThisMonth={booksReadThisMonth}
            />
          </div>
        </div>
      </div>

      {/* Fixed Bottom Input */}
      <BottomInputBar
        onSubmitEntry={onSubmitEntry}
        isSubmitting={isSubmitting}
        submitError={submitError}
      />
    </div>
  );
}
