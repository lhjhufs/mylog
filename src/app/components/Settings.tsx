import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { testGeminiConnection } from '@/lib/gemini';
import { downloadEntriesCsv, downloadUserDataJson } from '@/lib/export';
import { getMySettings, saveMySettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import {
  confirmDetectedRoutine,
  createConfirmedRoutine,
  loadDetectedRoutines,
  softDeleteDetectedRoutine,
  updateDetectedRoutine,
  type DetectedRoutine,
} from '@/lib/routines';

type SettingsSection = 'profile' | 'api' | 'routines' | 'data';
type StatusKind = 'idle' | 'success' | 'error';

interface SettingsProps {
  onClose: () => void;
  onRoutineConfirmed?: () => void;
}

function statusClass(kind: StatusKind): string {
  if (kind === 'success') return 'text-[#38A169]';
  if (kind === 'error') return 'text-[#E53E3E]';
  return 'text-[#6B6B6B]';
}

export function Settings({ onClose, onRoutineConfirmed }: SettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl h-[90vh] sm:h-[80vh] flex overflow-hidden relative">
        <button
          onClick={onClose}
          className="absolute top-4 sm:top-6 right-4 sm:right-6 text-[#6B6B6B] hover:text-[#1A1A1A] z-10"
          type="button"
          aria-label="설정 닫기"
        >
          <X size={20} />
        </button>

        <div className="w-48 sm:w-64 bg-[#F7F7F5] p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-[#1A1A1A] mb-6 sm:mb-8">설정</h2>

          <nav className="space-y-1">
            {(
              [
                ['profile', '👤 프로필'],
                ['api', '🔑 API 연동'],
                ['routines', '🔁 루틴 관리'],
                ['data', '💾 데이터 관리'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={`w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg transition-colors text-sm sm:text-base ${
                  activeSection === id
                    ? 'bg-black text-white'
                    : 'text-[#1A1A1A] hover:bg-[#E5E5E5]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeSection === 'profile' && <ProfileSection onClose={onClose} />}
          {activeSection === 'api' && <APISection />}
          {activeSection === 'routines' && (
            <RoutinesSection onRoutineConfirmed={onRoutineConfirmed} />
          )}
          {activeSection === 'data' && <DataSection />}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ onClose }: { onClose: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarLetter, setAvatarLetter] = useState('?');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [status, setStatus] = useState<{ kind: StatusKind; message: string }>({
    kind: 'idle',
    message: '',
  });

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const authFallback =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split('@')[0] ??
        '';

      setEmail(user.email ?? '');

      try {
        const settings = await getMySettings();
        const name = settings?.display_name?.trim() || authFallback;
        setDisplayName(name);
        setAvatarLetter(name.charAt(0) || '?');
      } catch {
        setDisplayName(authFallback);
        setAvatarLetter(authFallback.charAt(0) || '?');
      }
    };

    loadProfile();
  }, []);

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setStatus({ kind: 'error', message: '이름을 입력해주세요.' });
      return;
    }

    setIsSaving(true);
    setStatus({ kind: 'idle', message: '' });

    try {
      await saveMySettings({ display_name: trimmed });
      setDisplayName(trimmed);
      setAvatarLetter(trimmed.charAt(0) || '?');
      setStatus({ kind: 'success', message: '이름이 저장되었습니다.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : '이름 저장 실패',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
      onClose();
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : '로그아웃 실패',
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div>
      <h3 className="text-xl sm:text-2xl font-semibold text-[#1A1A1A] mb-4 sm:mb-6">프로필</h3>

      <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-4 mb-4 sm:mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#E5E5E5] rounded-full flex items-center justify-center text-xl sm:text-2xl text-[#6B6B6B]">
            {avatarLetter}
          </div>
        </div>

        <div>
          <label className="block text-xs sm:text-sm text-[#6B6B6B] mb-2">이름</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 px-3 sm:px-4 py-2 text-sm sm:text-base border border-[#E5E5E5] rounded-lg focus:border-[#6B6B6B] outline-none transition-colors"
              placeholder="표시 이름"
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={isSaving}
              className="px-3 sm:px-4 py-2 text-sm sm:text-base bg-black text-white rounded-lg hover:bg-[#1A1A1A] transition-colors disabled:opacity-50"
            >
              {isSaving ? '저장중...' : '저장'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs sm:text-sm text-[#6B6B6B] mb-2">이메일</label>
          <input
            type="email"
            value={email}
            readOnly
            className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base bg-[#F7F7F5] border border-[#E5E5E5] rounded-lg text-[#6B6B6B]"
          />
          <p className="mt-1 text-xs text-[#999999]">Supabase Auth 계정 이메일입니다.</p>
        </div>

        {status.message ? (
          <p className={`text-xs ${statusClass(status.kind)}`}>
            {status.kind === 'success' ? '✅ ' : status.kind === 'error' ? '❌ ' : ''}
            {status.message}
          </p>
        ) : null}
      </div>

      <div className="h-px bg-[#E5E5E5] my-6 sm:my-8" />

      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="bg-white border border-[#E0E0E0] text-[#E53E3E] px-5 sm:px-6 py-2 text-sm sm:text-base rounded-md hover:bg-[#FFF5F5] transition-colors disabled:opacity-50"
      >
        {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
      </button>
    </div>
  );
}

function APISection() {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ kind: StatusKind; message: string }>({
    kind: 'idle',
    message: '',
  });
  const [testStatus, setTestStatus] = useState<{ kind: StatusKind; message: string }>({
    kind: 'idle',
    message: '',
  });
  const [calendarNotice, setCalendarNotice] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getMySettings();
        if (!settings) return;

        const existingKey = settings.gemini_api_key ?? '';
        setGeminiApiKey(existingKey);
        setIsConnected(Boolean(existingKey.trim()));
      } catch (error) {
        setSaveStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : '설정 불러오기 실패',
        });
      }
    };

    loadSettings();
  }, []);

  const handleSaveGeminiKey = async () => {
    const trimmed = geminiApiKey.trim();
    if (!trimmed) {
      setSaveStatus({ kind: 'error', message: 'Gemini API 키를 입력해주세요.' });
      return;
    }

    setIsSaving(true);
    setSaveStatus({ kind: 'idle', message: '' });

    try {
      const saved = await saveMySettings({ gemini_api_key: trimmed });
      setIsConnected(Boolean((saved.gemini_api_key ?? '').trim()));
      setSaveStatus({ kind: 'success', message: 'API 키가 저장되었습니다.' });
    } catch (error) {
      setSaveStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : '저장 실패',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const trimmed = geminiApiKey.trim();
    if (!trimmed) {
      setTestStatus({ kind: 'error', message: '테스트할 Gemini API 키를 입력해주세요.' });
      return;
    }

    setIsTesting(true);
    setTestStatus({ kind: 'idle', message: '' });

    try {
      await testGeminiConnection(trimmed);
      setIsConnected(true);
      setTestStatus({
        kind: 'success',
        message: '연결 성공: gemini-2.5-flash 모델 응답을 확인했습니다.',
      });
    } catch (error) {
      setIsConnected(false);
      setTestStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : '연결 테스트 실패',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCalendarConnect = () => {
    setCalendarNotice('구글 캘린더 연동은 추후 제공될 예정입니다.');
  };

  return (
    <div>
      <h3 className="text-xl sm:text-2xl font-semibold text-[#1A1A1A] mb-4 sm:mb-6">API 연동</h3>

      <div className="mb-6 sm:mb-8">
        <label className="block text-xs sm:text-sm text-[#6B6B6B] mb-2">Gemini API 키</label>
        <div className="flex gap-2 mb-3">
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            className="flex-1 px-3 sm:px-4 py-2 text-sm sm:text-base border border-[#E5E5E5] rounded-lg focus:border-[#6B6B6B] outline-none transition-colors"
            placeholder="AIza..."
          />
          <button
            type="button"
            onClick={handleSaveGeminiKey}
            disabled={isSaving || isTesting}
            className="px-3 sm:px-4 py-2 text-sm sm:text-base border border-[#E5E5E5] rounded-lg hover:bg-[#F7F7F5] transition-colors disabled:opacity-50"
          >
            {isSaving ? '저장중...' : '저장'}
          </button>
        </div>
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting || isSaving}
          className="px-3 sm:px-4 py-2 bg-white border border-[#E5E5E5] rounded-lg hover:bg-[#F7F7F5] transition-colors text-xs sm:text-sm disabled:opacity-50"
        >
          {isTesting ? '테스트중...' : '연결 테스트'}
        </button>
        {saveStatus.message ? (
          <p className={`mt-2 text-xs ${statusClass(saveStatus.kind)}`}>
            {saveStatus.kind === 'success' ? '✅ ' : saveStatus.kind === 'error' ? '❌ ' : ''}
            {saveStatus.message}
          </p>
        ) : null}
        {testStatus.message ? (
          <p className={`mt-2 text-xs ${statusClass(testStatus.kind)}`}>
            {testStatus.kind === 'success' ? '✅ ' : testStatus.kind === 'error' ? '❌ ' : ''}
            {testStatus.message}
          </p>
        ) : null}
        <div className="mt-2 text-xs sm:text-sm">
          {isConnected ? (
            <span className="text-[#38A169]">✅ 연결됨</span>
          ) : (
            <span className="text-[#E53E3E]">❌ 연결 안됨</span>
          )}
        </div>
      </div>

      <div className="h-px bg-[#E5E5E5] my-6 sm:my-8" />

      <div>
        <h4 className="text-base sm:text-lg font-medium text-[#1A1A1A] mb-3 sm:mb-4">구글 캘린더</h4>
        <button
          type="button"
          onClick={handleCalendarConnect}
          className="px-5 sm:px-6 py-2 text-sm sm:text-base bg-black text-white rounded-lg hover:bg-[#1A1A1A] transition-colors"
        >
          연동하기
        </button>
        {calendarNotice ? (
          <p className="mt-2 text-xs text-[#6B6B6B]">{calendarNotice}</p>
        ) : (
          <p className="mt-2 text-xs text-[#999999]">추후 구현 예정</p>
        )}
      </div>
    </div>
  );
}

function RoutinesSection({ onRoutineConfirmed }: { onRoutineConfirmed?: () => void }) {
  const [confirmed, setConfirmed] = useState<DetectedRoutine[]>([]);
  const [unconfirmed, setUnconfirmed] = useState<DetectedRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newFrequency, setNewFrequency] = useState('매일');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFrequency, setEditFrequency] = useState('');
  const [error, setError] = useState('');

  const loadRoutines = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      const all = await loadDetectedRoutines(session.user.id);
      setConfirmed(all.filter((r) => r.is_confirmed));
      setUnconfirmed(all.filter((r) => !r.is_confirmed));
    } catch (err) {
      setError(err instanceof Error ? err.message : '루틴 불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoutines();
  }, [loadRoutines]);

  const handleAdd = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;

    setIsAdding(true);
    setError('');
    try {
      await createConfirmedRoutine(session.user.id, newName, newFrequency);
      setNewName('');
      setNewFrequency('매일');
      await loadRoutines();
      onRoutineConfirmed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '루틴 추가 실패');
    } finally {
      setIsAdding(false);
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      await confirmDetectedRoutine(id);
      await loadRoutines();
      onRoutineConfirmed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '루틴 등록 실패');
    }
  };

  const handleSoftDelete = async (id: string) => {
    if (!window.confirm('이 루틴을 삭제할까요? (완료 기록은 유지됩니다)')) return;
    try {
      await softDeleteDetectedRoutine(id);
      await loadRoutines();
      onRoutineConfirmed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '루틴 삭제 실패');
    }
  };

  const startEdit = (routine: DetectedRoutine) => {
    setEditingId(routine.id);
    setEditName(routine.name);
    setEditFrequency(routine.frequency);
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await updateDetectedRoutine(id, { name: editName, frequency: editFrequency });
      setEditingId(null);
      await loadRoutines();
      onRoutineConfirmed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '루틴 수정 실패');
    }
  };

  return (
    <div>
      <h3 className="text-xl sm:text-2xl font-semibold text-[#1A1A1A] mb-4 sm:mb-6">루틴 관리</h3>

      {error ? <p className="text-xs text-[#E53E3E] mb-4">❌ {error}</p> : null}

      <div className="mb-6 sm:mb-8">
        <h4 className="text-base sm:text-lg font-medium text-[#1A1A1A] mb-3">루틴 추가</h4>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="예: 아침 운동 30분"
            className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg outline-none focus:border-[#6B6B6B]"
          />
          <input
            type="text"
            value={newFrequency}
            onChange={(e) => setNewFrequency(e.target.value)}
            placeholder="빈도"
            className="w-full sm:w-28 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg outline-none focus:border-[#6B6B6B]"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isAdding || !newName.trim()}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-[#1A1A1A] disabled:opacity-50"
          >
            {isAdding ? '추가중...' : '추가'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#999999]">불러오는 중...</p>
      ) : (
        <>
          <h4 className="text-base sm:text-lg font-medium text-[#1A1A1A] mb-3">등록된 루틴</h4>
          {confirmed.length === 0 ? (
            <p className="text-sm text-[#999999] mb-6">등록된 루틴이 없습니다.</p>
          ) : (
            <div className="space-y-2 mb-6">
              {confirmed.map((routine) => (
                <div
                  key={routine.id}
                  className="flex items-center gap-2 p-2.5 sm:p-3 border border-[#E5E5E5] rounded-lg"
                >
                  {editingId === routine.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1 text-sm border border-[#E5E5E5] rounded"
                      />
                      <input
                        type="text"
                        value={editFrequency}
                        onChange={(e) => setEditFrequency(e.target.value)}
                        className="w-20 px-2 py-1 text-xs border border-[#E5E5E5] rounded"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(routine.id)}
                        className="p-1.5 text-[#38A169] hover:bg-[#F0FFF4] rounded"
                        aria-label="저장"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] rounded"
                        aria-label="취소"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-base text-[#1A1A1A] truncate">{routine.name}</div>
                        <div className="text-xs text-[#6B6B6B]">{routine.frequency}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(routine)}
                        className="p-1.5 text-[#6B6B6B] hover:bg-[#F7F7F5] rounded"
                        aria-label="수정"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSoftDelete(routine.id)}
                        className="p-1.5 text-[#E53E3E] hover:bg-[#FFF5F5] rounded"
                        aria-label="삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="h-px bg-[#E5E5E5] my-6 sm:my-8" />

          <h4 className="text-base sm:text-lg font-medium text-[#1A1A1A] mb-3 sm:mb-4">AI가 감지한 루틴</h4>
          {unconfirmed.length === 0 ? (
            <p className="text-sm text-[#999999]">감지된 루틴이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {unconfirmed.map((routine) => (
                <div
                  key={routine.id}
                  className="flex items-center justify-between p-2.5 sm:p-3 border border-[#E5E5E5] rounded-lg"
                >
                  <span className="text-sm sm:text-base text-[#1A1A1A] truncate flex-1 mr-2">
                    {routine.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleConfirm(routine.id)}
                    className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-black text-white rounded hover:bg-[#1A1A1A] transition-colors"
                  >
                    등록
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DataSection() {
  const [isJsonLoading, setIsJsonLoading] = useState(false);
  const [isCsvLoading, setIsCsvLoading] = useState(false);
  const [status, setStatus] = useState<{ kind: StatusKind; message: string }>({
    kind: 'idle',
    message: '',
  });

  const handleJsonDownload = async () => {
    setIsJsonLoading(true);
    setStatus({ kind: 'idle', message: '' });
    try {
      await downloadUserDataJson();
      setStatus({ kind: 'success', message: 'JSON 백업 파일을 다운로드했습니다.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'JSON 다운로드 실패',
      });
    } finally {
      setIsJsonLoading(false);
    }
  };

  const handleCsvDownload = async () => {
    setIsCsvLoading(true);
    setStatus({ kind: 'idle', message: '' });
    try {
      await downloadEntriesCsv();
      setStatus({ kind: 'success', message: 'CSV 파일을 다운로드했습니다.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'CSV 다운로드 실패',
      });
    } finally {
      setIsCsvLoading(false);
    }
  };

  return (
    <div>
      <h3 className="text-xl sm:text-2xl font-semibold text-[#1A1A1A] mb-4 sm:mb-6">데이터 관리</h3>

      <div>
        <h4 className="text-base sm:text-lg font-medium text-[#1A1A1A] mb-3 sm:mb-4">전체 데이터 백업</h4>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-2">
          <button
            type="button"
            onClick={handleJsonDownload}
            disabled={isJsonLoading || isCsvLoading}
            className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-black text-white rounded-lg hover:bg-[#1A1A1A] transition-colors disabled:opacity-50"
          >
            {isJsonLoading ? '준비중...' : 'JSON으로 다운로드'}
          </button>
          <button
            type="button"
            onClick={handleCsvDownload}
            disabled={isJsonLoading || isCsvLoading}
            className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-white border border-[#E5E5E5] rounded-lg hover:bg-[#F7F7F5] transition-colors disabled:opacity-50"
          >
            {isCsvLoading ? '준비중...' : 'CSV로 다운로드'}
          </button>
        </div>
        <p className="text-xs sm:text-sm text-[#6B6B6B]">
          JSON: entries, detected_routines, ai_reports 전체 · CSV: entries만
        </p>
        {status.message ? (
          <p className={`mt-2 text-xs ${statusClass(status.kind)}`}>
            {status.kind === 'success' ? '✅ ' : status.kind === 'error' ? '❌ ' : ''}
            {status.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
