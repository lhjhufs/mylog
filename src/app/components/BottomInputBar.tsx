import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Mic } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

interface BottomInputBarProps {
  onSubmitEntry: (input: string) => Promise<boolean>;
  isSubmitting?: boolean;
  submitError?: string;
  autoSubmitVoice?: boolean;
}

export function BottomInputBar({
  onSubmitEntry,
  isSubmitting = false,
  submitError = '',
  autoSubmitVoice = false,
}: BottomInputBarProps) {
  const [input, setInput] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const voiceBaseRef = useRef('');

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSubmitting) return false;

      const success = await onSubmitEntry(trimmed);
      if (success) {
        setInput('');
        voiceBaseRef.current = '';
      }
      return success;
    },
    [isSubmitting, onSubmitEntry],
  );

  const handleVoiceTranscript = useCallback((text: string, isFinal: boolean) => {
    const merged = `${voiceBaseRef.current}${text}`.trim();
    setInput(merged);
    if (isFinal) {
      setVoiceError('');
    }
  }, []);

  const handleVoiceComplete = useCallback(
    (text: string) => {
      const merged = `${voiceBaseRef.current}${text}`.trim();
      setInput(merged);
      if (autoSubmitVoice && merged) {
        void submitText(merged);
      }
    },
    [autoSubmitVoice, submitText],
  );

  const { isListening, isSupported, start, stop } = useSpeechRecognition({
    lang: 'ko-KR',
    onTranscript: handleVoiceTranscript,
    onComplete: handleVoiceComplete,
    onError: setVoiceError,
  });

  const handleMicClick = () => {
    if (isSubmitting) return;

    if (!isSupported) {
      setVoiceError('이 브라우저는 음성 입력을 지원하지 않습니다.');
      return;
    }

    if (isListening) {
      stop();
      return;
    }

    setVoiceError('');
    voiceBaseRef.current = input.trim() ? `${input.trim()} ` : '';
    start();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitText(input);
  };

  return (
    <div className="flex-shrink-0 bg-white z-20 border-t border-[#F7F7F5]">
      <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-2">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 sm:gap-3 border border-[#E5E5E5] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 focus-within:border-[#6B6B6B] transition-colors">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? '말씀해 주세요...' : '오늘 무슨 일이 있었나요?'}
              className="flex-1 text-sm sm:text-base text-[#1A1A1A] placeholder:text-[#999999] outline-none bg-transparent"
            />

            <button
              type="button"
              onClick={handleMicClick}
              disabled={isSubmitting}
              aria-label={isListening ? '음성 입력 중지' : '음성 입력 시작'}
              aria-pressed={isListening}
              className={`flex-shrink-0 rounded-full p-1 transition-colors disabled:opacity-50 ${
                isListening
                  ? 'text-[#E53E3E] bg-[#FFF5F5] animate-pulse'
                  : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
              }`}
            >
              <Mic size={18} className="sm:w-5 sm:h-5" />
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isListening}
              className="bg-black text-white px-4 sm:px-5 py-1.5 sm:py-2 rounded-full text-sm font-medium hover:bg-[#1A1A1A] transition-colors flex-shrink-0 disabled:opacity-50"
            >
              {isSubmitting ? '저장중...' : '기록'}
            </button>
          </div>
        </form>

        <div className="mt-2 ml-1 min-h-[3rem] text-xs leading-relaxed" aria-live="polite">
          {voiceError ? (
            <p className="text-[#E53E3E]">🎙️ {voiceError}</p>
          ) : submitError ? (
            <p className="text-[#E53E3E]">❌ {submitError}</p>
          ) : isListening ? (
            <p className="text-[#E53E3E]">🎙️ 듣고 있어요… 말을 멈추면 인식이 완료됩니다</p>
          ) : (
            <span className="invisible select-none" aria-hidden="true">
              &#8203;
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
