import { Mic } from 'lucide-react';
import { useState } from 'react';

export function QuickInput() {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      // Handle input submission
      console.log('Submitted:', input);
      setInput('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div
        className={`relative bg-white border rounded-xl overflow-hidden transition-all ${
          isFocused ? 'border-[#6B6B6B]' : 'border-[#E5E5E5]'
        }`}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="오늘 무슨 일이 있었나요?"
          className="w-full px-4 sm:px-5 py-3 sm:py-4 text-sm sm:text-base text-[#1A1A1A] placeholder:text-[#6B6B6B] outline-none bg-transparent pr-12"
        />
        <button
          type="button"
          className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors"
        >
          <Mic size={18} className="sm:w-5 sm:h-5" />
        </button>
      </div>
      <p className="text-xs text-[#6B6B6B] mt-2 ml-1">
        일정은 캘린더로 자동 저장돼요
      </p>
    </form>
  );
}
