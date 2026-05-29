import { useEffect, useState } from 'react';
import { Check, Edit2, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import type { TimelineEntryView } from '@/lib/entries';

interface TimelineEntryProps {
  entry: TimelineEntryView;
  onUpdate: (input: { time: string; content: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  onRetryAnalysis?: () => void;
}

const categoryIcons: Record<string, string> = {
  '식사': '🍚',
  '독서': '📚',
  '운동': '🏃',
  '활동': '📝',
  '아이디어': '💡',
  '수면': '😴',
  '일정': '📅',
  '루틴': '🔁',
  '기타': '💬',
};

export function TimelineEntry({ entry, onUpdate, onDelete, onRetryAnalysis }: TimelineEntryProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTime, setEditTime] = useState(entry.time);
  const [editContent, setEditContent] = useState(entry.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const isAnalyzing = entry.status === 'analyzing';
  const isAnalysisFailed = entry.status === 'analysis_failed';
  const canEdit = !isAnalyzing && !entry.isOptimistic;

  useEffect(() => {
    if (!isEditing) {
      setEditTime(entry.time);
      setEditContent(entry.content);
    }
  }, [entry.time, entry.content, isEditing]);

  const startEdit = () => {
    if (!canEdit) return;
    setEditTime(entry.time);
    setEditContent(entry.content);
    setError('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setEditTime(entry.time);
    setEditContent(entry.content);
    setError('');
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (isSaving || !canEdit) return;

    const trimmedContent = editContent.trim();
    if (!trimmedContent) {
      setError('내용을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onUpdate({ time: editTime.trim(), content: trimmedContent });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting || isEditing || entry.isOptimistic) return;
    if (!window.confirm('이 기록을 삭제할까요?')) return;

    setIsDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="group relative -mx-3 sm:-mx-4 px-4 sm:px-5 py-3.5 rounded-lg hover:bg-[#F7F7F5] transition-colors">
      <div className="flex items-start gap-4 sm:gap-5">
        {isEditing ? (
          <input
            type="time"
            value={editTime}
            onChange={(e) => setEditTime(e.target.value)}
            className="text-sm text-[#1A1A1A] w-[5.5rem] flex-shrink-0 px-1 py-0.5 border border-[#E5E5E5] rounded bg-white"
          />
        ) : (
          <div className="text-sm text-[#6B6B6B] w-10 flex-shrink-0">{entry.time}</div>
        )}

        <div className="flex-1 min-w-0 flex items-start gap-3">
          {isAnalyzing ? (
            <Loader2 size={16} className="flex-shrink-0 mt-0.5 animate-spin text-[#6B6B6B]" />
          ) : (
            <span className="text-base flex-shrink-0">{categoryIcons[entry.category]}</span>
          )}
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={2}
              className="flex-1 text-base text-[#1A1A1A] px-2 py-1 border border-[#E5E5E5] rounded-lg resize-y min-h-[2.5rem] bg-white outline-none focus:border-[#6B6B6B]"
            />
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-base text-[#1A1A1A]">{entry.content}</p>
              {isAnalyzing ? (
                <p className="mt-1 text-xs text-[#6B6B6B] animate-pulse">분석중...</p>
              ) : null}
              {isAnalysisFailed && onRetryAnalysis ? (
                <button
                  type="button"
                  onClick={onRetryAnalysis}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-[#1A1A1A] border border-[#E5E5E5] rounded-md px-2 py-1 hover:bg-white transition-colors"
                >
                  <RefreshCw size={12} />
                  분석 재시도
                </button>
              ) : null}
            </div>
          )}
        </div>

        {!isEditing && entry.emotion && !isAnalyzing ? (
          <div className="px-3 py-1 bg-[#F7F7F5] group-hover:bg-white text-[#6B6B6B] text-xs rounded-full flex-shrink-0 transition-colors">
            {entry.emotion}
          </div>
        ) : null}

        {canEdit ? (
          <div className="flex items-center gap-1 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="p-1.5 text-[#38A169] hover:bg-[#F0FFF4] rounded transition-colors disabled:opacity-50"
                  aria-label="저장"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={isSaving}
                  className="p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] rounded transition-colors disabled:opacity-50"
                  aria-label="취소"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={isDeleting}
                  className="p-1.5 text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors disabled:opacity-50"
                  aria-label="수정"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-1.5 text-[#6B6B6B] hover:text-[#E53E3E] transition-colors disabled:opacity-50"
                  aria-label="삭제"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-2 pl-14 sm:pl-[4.5rem] text-xs text-[#E53E3E]">{error}</p> : null}
    </div>
  );
}
