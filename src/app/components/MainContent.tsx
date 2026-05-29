import { Timeline } from './Timeline';
import { AIAnalysis } from './AIAnalysis';

export function MainContent() {
  const currentDate = new Date(2026, 4, 28); // May 28, 2026

  return (
    <div className="flex-1 bg-white flex justify-center overflow-auto">
      <div className="w-full max-w-[780px] px-4 sm:px-6 lg:px-12 py-6 lg:py-12 pb-32">
        {/* Date Header */}
        <h1 className="text-2xl sm:text-[28px] lg:text-[32px] text-[#1A1A1A] font-light mb-6 lg:mb-8 mt-12 lg:mt-0">
          {currentDate.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
          })}
        </h1>

        {/* Timeline */}
        <Timeline />

        {/* AI Analysis */}
        <div className="mt-6 lg:mt-8">
          <AIAnalysis />
        </div>
      </div>
    </div>
  );
}
