import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatKstMonthYear, getKstParts } from '@/lib/date';
import { loadMonthMoodForCalendar } from '@/lib/dashboard';

interface MiniCalendarProps {
  monthMoodByDay: Record<number, string>;
  userId: string | null;
}

export function MiniCalendar({ monthMoodByDay: initialMoodByDay, userId }: MiniCalendarProps) {
  const kstNow = getKstParts();
  const [viewYear, setViewYear] = useState(kstNow.year);
  const [viewMonth, setViewMonth] = useState(kstNow.month);
  const [moodByDay, setMoodByDay] = useState<Record<number, string>>(initialMoodByDay);

  useEffect(() => {
    setMoodByDay(initialMoodByDay);
  }, [initialMoodByDay]);

  useEffect(() => {
    if (!userId) return;
    if (viewYear === kstNow.year && viewMonth === kstNow.month) return;

    loadMonthMoodForCalendar(userId, viewYear, viewMonth)
      .then(setMoodByDay)
      .catch((error) => console.error('Failed to load calendar moods:', error));
  }, [userId, viewYear, viewMonth, kstNow.year, kstNow.month]);

  const getDaysInMonth = (year: number, month: number) => {
    const firstDay = new Date(`${year}-${String(month).padStart(2, '0')}-01T12:00:00+09:00`);
    const lastDay = new Date(`${year}-${String(month).padStart(2, '0')}-01T12:00:00+09:00`);
    lastDay.setMonth(lastDay.getMonth() + 1);
    lastDay.setDate(0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    return { daysInMonth, startingDayOfWeek };
  };

  const goToPreviousMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(viewYear, viewMonth);
  const days = [];

  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(<div key={`empty-start-${i}`} className="aspect-square" />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday =
      day === kstNow.day && viewMonth === kstNow.month && viewYear === kstNow.year;
    const moodEmoji = moodByDay[day];

    days.push(
      <div
        key={day}
        className={`aspect-square flex flex-col items-center justify-center text-xs sm:text-sm min-h-[32px] rounded ${
          isToday ? 'bg-black text-white' : 'text-[#1A1A1A]'
        }`}
        style={{ borderRadius: '4px' }}
      >
        <span>{day}</span>
        {moodEmoji && !isToday ? (
          <span className="text-[10px] leading-none mt-0.5">{moodEmoji}</span>
        ) : null}
      </div>,
    );
  }

  const totalCells = 42;
  const remainingCells = totalCells - days.length;
  for (let i = 0; i < remainingCells; i++) {
    days.push(<div key={`empty-end-${i}`} className="aspect-square min-h-[32px]" />);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="text-[#1A1A1A] text-xs sm:text-sm font-medium">
          {formatKstMonthYear(viewYear, viewMonth)}
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={goToPreviousMonth}
            className="p-1 hover:bg-[#E5E5E5] rounded transition-colors"
            aria-label="이전 달"
          >
            <ChevronLeft size={14} className="sm:w-4 sm:h-4 text-[#6B6B6B]" />
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            className="p-1 hover:bg-[#E5E5E5] rounded transition-colors"
            aria-label="다음 달"
          >
            <ChevronRight size={14} className="sm:w-4 sm:h-4 text-[#6B6B6B]" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
          <div key={day} className="aspect-square flex items-center justify-center text-xs text-[#6B6B6B]">
            {day}
          </div>
        ))}
        {days}
      </div>
    </div>
  );
}
