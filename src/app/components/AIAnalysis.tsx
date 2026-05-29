import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function AIAnalysis() {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between hover:bg-[#F7F7F5] transition-colors"
      >
        <h3 className="text-sm sm:text-base text-[#1A1A1A] font-medium">AI 오늘의 분석</h3>
        {isExpanded ? (
          <ChevronUp size={18} className="sm:w-5 sm:h-5 text-[#6B6B6B]" />
        ) : (
          <ChevronDown size={18} className="sm:w-5 sm:h-5 text-[#6B6B6B]" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-[#E5E5E5]">
          <div className="pt-3 sm:pt-4 space-y-3 sm:space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div>
                <div className="text-xs text-[#6B6B6B] mb-1">칼로리 합계</div>
                <div className="text-base sm:text-lg text-[#1A1A1A] font-medium">1,850 kcal</div>
              </div>
              <div>
                <div className="text-xs text-[#6B6B6B] mb-1">기분 평균</div>
                <div className="text-base sm:text-lg text-[#1A1A1A] font-medium">😊 좋음</div>
              </div>
              <div>
                <div className="text-xs text-[#6B6B6B] mb-1">루틴 달성률</div>
                <div className="text-base sm:text-lg text-[#1A1A1A] font-medium">60%</div>
              </div>
            </div>

            {/* Insight */}
            <div className="pt-3 border-t border-[#E5E5E5]">
              <p className="text-xs sm:text-sm text-[#1A1A1A]">
                "오늘 운동 후 기분이 좋아지는 패턴이 있어요. 꾸준히 유지해보세요!"
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
