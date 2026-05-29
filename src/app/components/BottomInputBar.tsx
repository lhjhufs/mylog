import { Mic } from 'lucide-react';
import { useState } from 'react';

interface BottomInputBarProps {
  onSubmitEntry: (input: string) => Promise<boolean>;
  isSubmitting?: boolean;
  submitError?: string;
}

export function BottomInputBar({
  onSubmitEntry,
  isSubmitting = false,
  submitError = '',
}: BottomInputBarProps) {
  const [input, setInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmed = input.trim();
    if (!trimmed) return;

    const success = await onSubmitEntry(trimmed);
    if (success) {
      setInput('');
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white z-20">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <form onSubmit={handleSubmit}>
          {/* Input Field with Border */}
          <div className="flex items-center gap-2 sm:gap-3 border border-[#E5E5E5] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 focus-within:border-[#6B6B6B] transition-colors">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="오늘 무슨 일이 있었나요?"
              className="flex-1 text-sm sm:text-base text-[#1A1A1A] placeholder:text-[#999999] outline-none bg-transparent"
            />

            {/* Voice Input Button */}
            <button
              type="button"
              className="text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors flex-shrink-0"
            >
              <Mic size={18} className="sm:w-5 sm:h-5" />
            </button>

            {/* Send Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-black text-white px-4 sm:px-5 py-1.5 sm:py-2 rounded-full text-sm font-medium hover:bg-[#1A1A1A] transition-colors flex-shrink-0"
            >
              {isSubmitting ? '저장중...' : '기록'}
            </button>
          </div>
        </form>

        {submitError ? (
          <p className="text-xs text-[#E53E3E] mt-2 ml-1">❌ {submitError}</p>
        ) : null}

        {/* Hint Text */}
        <p className="text-[10px] sm:text-[11px] text-[#999999] mt-2 ml-1">
          일정은 캘린더로 자동 저장 · [루틴]으로 루틴 등록
        </p>
      </div>
    </div>
  );
}
