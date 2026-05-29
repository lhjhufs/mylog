import { CheckSquare, Square } from 'lucide-react';
import type { DetectedRoutine } from '@/lib/routines';

interface RoutineListProps {
  routines: DetectedRoutine[];
  routineDone: number;
  routineTotal: number;
  completionMap: Record<string, boolean>;
  suggestions: DetectedRoutine[];
  onConfirmSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
}

export function RoutineList({
  routines,
  routineDone,
  routineTotal,
  completionMap,
  suggestions,
  onConfirmSuggestion,
  onDismissSuggestion,
}: RoutineListProps) {
  const percentage = routineTotal > 0 ? Math.round((routineDone / routineTotal) * 100) : 0;

  return (
    <div>
      <h3 className="text-[#1A1A1A] text-sm font-medium mb-3">오늘 루틴 달성률</h3>

      {routineTotal > 0 ? (
        <>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#6B6B6B]">
                {routineDone}/{routineTotal} 완료
              </span>
              <span className="text-xs text-[#6B6B6B] font-medium">{percentage}%</span>
            </div>
            <div className="h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <h4 className="text-xs text-[#6B6B6B] mb-2">등록된 루틴</h4>
          <div className="space-y-1 mb-4">
            {routines.map((routine) => {
              const done = completionMap[routine.id] ?? false;
              return (
                <div key={routine.id} className="flex items-center gap-2 py-1.5">
                  {done ? (
                    <CheckSquare size={16} className="text-[#1A1A1A] flex-shrink-0" />
                  ) : (
                    <Square size={16} className="text-[#6B6B6B] flex-shrink-0" />
                  )}
                  <span
                    className={`text-sm flex-1 ${done ? 'text-[#1A1A1A]' : 'text-[#6B6B6B]'}`}
                  >
                    {routine.name}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-[#999999] mb-4">
          등록된 루틴이 없습니다.
          <br />
          <span className="text-xs">[루틴] 아침 운동 30분 형식으로 등록해보세요.</span>
        </p>
      )}

      {suggestions.length > 0 ? (
        <div className="mt-2 pt-3 border-t border-[#EEEEEE]">
          <h4 className="text-xs text-[#6B6B6B] mb-2">AI 루틴 제안</h4>
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="p-2.5 border border-[#E5E5E5] rounded-lg bg-white"
              >
                <p className="text-sm text-[#1A1A1A] mb-2">
                  <span className="font-medium">{suggestion.name}</span>
                  을 루틴으로 등록할까요?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirmSuggestion?.(suggestion.id)}
                    className="px-2.5 py-1 text-xs bg-black text-white rounded hover:bg-[#1A1A1A]"
                  >
                    등록
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissSuggestion?.(suggestion.id)}
                    className="px-2.5 py-1 text-xs text-[#6B6B6B] hover:text-[#1A1A1A]"
                  >
                    무시
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
