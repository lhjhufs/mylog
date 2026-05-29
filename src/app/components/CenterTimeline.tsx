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
  todaySummary,
}: CenterTimelineProps) {
  return (
    <div className="flex-1 bg-white lg:h-screen flex flex-col relative">
      <div className="flex-1 lg:overflow-y-auto lg:px-8 pt-0 lg:pt-8 pb-0 lg:pb-40">
        <h1 className="text-2xl sm:text-[28px] text-[#1A1A1A] font-light mb-2">
          {formatKstDateLong()}
        </h1>

        <p className="text-sm text-[#6B6B6B] mb-6">
          {todaySummary.line ?? '오늘 기록을 남기면 요약이 표시됩니다.'}
        </p>

        <div className="h-px bg-[#EEEEEE] mb-6" />

        <Timeline
          entries={entries}
          onCreateManualEntry={onCreateManualEntry}
          onUpdateEntry={onUpdateEntry}
          onDeleteEntry={onDeleteEntry}
          onRetryAnalysis={onRetryAnalysis}
          isSaving={isSubmitting}
        />
      </div>

      <div className={`hidden lg:block ${hideMobileInput ? 'lg:block hidden' : 'block'}`}>
        <BottomInputBar
          onSubmitEntry={onSubmitEntry}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      </div>
    </div>
  );
}
