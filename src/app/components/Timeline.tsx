import { useState } from 'react';
import { TimelineEntry } from './TimelineEntry';
import { Check, Plus, X } from 'lucide-react';
import { formatTimeForDisplay, getKstTimeString } from '@/lib/date';
import type { TimelineEntryView } from '@/lib/entries';

interface TimelineProps {
  entries: TimelineEntryView[];
  onCreateManualEntry: (input: { time: string; content: string }) => Promise<void>;
  onUpdateEntry: (entryId: string, input: { time: string; content: string }) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onRetryAnalysis?: (entryId: string) => void;
  isSaving?: boolean;
}

function ManualAddForm({
  defaultTime,
  isSaving,
  onSave,
  onCancel,
}: {
  defaultTime: string;
  isSaving: boolean;
  onSave: (input: { time: string; content: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [time, setTime] = useState(defaultTime);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setError('내용을 입력해주세요.');
      return;
    }

    setError('');
    try {
      await onSave({ time, content: trimmed });
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 -mx-3 sm:-mx-4 px-4 sm:px-5 py-4 bg-[#F7F7F5] rounded-lg border border-[#E5E5E5]"
    >
      <p className="text-xs text-[#6B6B6B] mb-3">직접 추가 (AI 분석 없이 저장)</p>
      <div className="flex items-start gap-4">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={isSaving}
          className="text-sm text-[#1A1A1A] w-[5.5rem] flex-shrink-0 px-1 py-1 border border-[#E5E5E5] rounded bg-white disabled:opacity-50"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="기록 내용"
          rows={2}
          disabled={isSaving}
          autoFocus
          className="flex-1 text-sm text-[#1A1A1A] px-2 py-1 border border-[#E5E5E5] rounded-lg resize-y min-h-[2.5rem] bg-white outline-none focus:border-[#6B6B6B] disabled:opacity-50"
        />
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="submit"
            disabled={isSaving}
            className="p-1.5 text-[#38A169] hover:bg-[#F0FFF4] rounded transition-colors disabled:opacity-50"
            aria-label="저장"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-1.5 text-[#6B6B6B] hover:bg-white rounded transition-colors disabled:opacity-50"
            aria-label="취소"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-[#E53E3E]">{error}</p> : null}
    </form>
  );
}

export function Timeline({
  entries,
  onCreateManualEntry,
  onUpdateEntry,
  onDeleteEntry,
  onRetryAnalysis,
  isSaving = false,
}: TimelineProps) {
  const [showManualAdd, setShowManualAdd] = useState(false);
  const defaultTime = formatTimeForDisplay(getKstTimeString());

  const handleManualSave = async (input: { time: string; content: string }) => {
    await onCreateManualEntry(input);
    setShowManualAdd(false);
  };

  return (
    <div>
      <div className="space-y-0">
        {entries.length === 0 ? (
          <p className="text-sm text-[#999999] py-4">아직 오늘 기록이 없습니다. 아래에서 첫 기록을 남겨보세요.</p>
        ) : null}
        {entries.map((entry) => (
          <TimelineEntry
            key={entry.id}
            entry={entry}
            onUpdate={(input) => onUpdateEntry(entry.id, input)}
            onDelete={() => onDeleteEntry(entry.id)}
            onRetryAnalysis={
              onRetryAnalysis ? () => onRetryAnalysis(entry.id) : undefined
            }
          />
        ))}
      </div>

      {showManualAdd ? (
        <ManualAddForm
          defaultTime={defaultTime}
          isSaving={isSaving}
          onSave={handleManualSave}
          onCancel={() => setShowManualAdd(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowManualAdd(true)}
          disabled={isSaving}
          className="mt-6 ml-1 sm:ml-2 text-sm text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          <Plus size={16} />
          <span>직접 추가</span>
        </button>
      )}
    </div>
  );
}
