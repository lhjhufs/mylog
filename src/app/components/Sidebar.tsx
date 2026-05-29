import { Settings } from 'lucide-react';
import { MiniCalendar } from './MiniCalendar';
import { RoutineList } from './RoutineList';
import { RecentLogs } from './RecentLogs';
import type { RecentLogItem } from '@/lib/dashboard';
import type { DetectedRoutine } from '@/lib/routines';

interface SidebarProps {
  onSettingsClick?: () => void;
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
}

export function Sidebar({
  onSettingsClick,
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
}: SidebarProps) {
  return (
    <div className="w-full lg:w-[300px] lg:bg-[#F7F7F5] lg:h-screen">
      <div className="lg:px-6 pt-6 lg:pt-8 pb-8 lg:overflow-y-auto lg:h-full">
        <div className="hidden lg:flex items-center justify-between mb-6">
          <h1 className="text-[#1A1A1A] font-bold text-xl">마이로그</h1>
          <button
            type="button"
            onClick={onSettingsClick}
            className="text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>

        <div className="lg:hidden flex justify-end mb-4">
          <button
            type="button"
            onClick={onSettingsClick}
            className="text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>

        <MiniCalendar monthMoodByDay={monthMoodByDay} userId={userId} />

        <div className="h-px bg-[#EEEEEE] my-4 sm:my-6" />

        <RoutineList
          routines={confirmedRoutines}
          routineDone={routineDone}
          routineTotal={routineTotal}
          completionMap={routineCompletionMap}
          suggestions={unconfirmedRoutines}
          onConfirmSuggestion={onConfirmRoutineSuggestion}
          onDismissSuggestion={onDismissRoutineSuggestion}
        />

        <div className="h-px bg-[#EEEEEE] my-4 sm:my-6" />

        <RecentLogs logs={recentLogs} />
      </div>
    </div>
  );
}
