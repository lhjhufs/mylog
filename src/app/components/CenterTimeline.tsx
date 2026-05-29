import { Timeline } from './Timeline';
import { BottomInputBar } from './BottomInputBar';
import type { TimelineEntryView } from '@/lib/entries';
import type { TodaySummaryView } from '@/lib/dashboard';
import { formatKstDateLong } from '@/lib/date';

interface CenterTimelineProps {
  hideMobileInput?: boolean;
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
}

export function CenterTimeline({
  hideMobileInput,
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
}: CenterTimelineProps) {
  return (
    <div className="flex-1 bg-white lg:h-screen flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto lg:px-8 pt-0 lg:pt-8 pb-4">
        <h1 className="text-2xl sm:text-[28px] text-[#1A1A1A] font-light mb-2">
          {formatKstDateLong()}
        </h1>

        <p className="text-sm text-[#6B6B6B] mb-6">
          {todaySummary.line ?? '오늘 기록을 남기면 요약이 표시됩니다.'}
        </p>

        <div className="h-px bg-[#EEEEEE] mb-6" />

        {dashboardLoadError ? (
          <div className="mb-4 p-3 rounded-lg bg-[#FFF5F5] border border-[#FED7D7] text-sm text-[#E53E3E]">
            기록을 불러오지 못했습니다: {dashboardLoadError}
            <br />
            <span className="text-xs text-[#6B6B6B]">
              데이터가 삭제된 것은 아닐 수 있습니다. F5 새로고침 후에도 같으면 Supabase Table
              Editor에서 entries 테이블과 로그인 이메일을 확인해주세요.
            </span>
          </div>
        ) : null}

        {!dashboardLoadError && entries.length === 0 && dataHint ? (
          <div className="mb-4 p-3 rounded-lg bg-[#F7F7F5] border border-[#EEEEEE] text-sm text-[#1A1A1A]">
            {dataHint.totalEntries > 0 ? (
              <>
                <strong>오늘({dataHint.todayKst})</strong> 기록은 없지만, 이 계정에는 전체{' '}
                <strong>{dataHint.totalEntries}건</strong>이 있습니다. 왼쪽 「최근 기록」을 확인하거나
                Supabase <code className="text-xs">entries</code>에서 날짜를 봐주세요.
              </>
            ) : (
              <>
                <strong>{dataHint.email || '로그인 계정'}</strong>에는 저장된 기록이 없습니다.
                예전에 보이던 기록이 있다면 <strong>다른 구글 계정</strong>으로 로그인했거나,{' '}
                <code className="text-xs">.env</code>의 Supabase 프로젝트가 다를 수 있습니다.
                설정(⚙)에서 이메일을 확인해주세요.
              </>
            )}
          </div>
        ) : null}

        <Timeline
          entries={entries}
          onCreateManualEntry={onCreateManualEntry}
          onUpdateEntry={onUpdateEntry}
          onDeleteEntry={onDeleteEntry}
          onRetryAnalysis={onRetryAnalysis}
          isSaving={isSubmitting}
        />
      </div>

      {!hideMobileInput ? (
        <BottomInputBar
          onSubmitEntry={onSubmitEntry}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      ) : null}
    </div>
  );
}
