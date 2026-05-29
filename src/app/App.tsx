import { Sidebar } from './components/Sidebar';
import { CenterTimeline } from './components/CenterTimeline';
import { RightPanel } from './components/RightPanel';
import { Login } from './components/Login';
import { Settings } from './components/Settings';
import { MobileSwipeView } from './components/MobileSwipeView';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { supabase } from '@/lib/supabase';
import { loadDashboardData, type DashboardData } from '@/lib/dashboard';
import {
  analyzeAndUpdateEntryWithRetry,
  createEntryRaw,
  markEntryAnalysisFailed,
  type AnalyzeEntryResult,
} from '@/lib/entryPipeline';
import {
  countUserEntries,
  createEntryManual,
  createOptimisticTimelineEntry,
  deleteEntry,
  sortTimelineEntries,
  updateEntry,
  toTimelineEntry,
  type TimelineEntryView,
} from '@/lib/entries';
import { getKstDateString } from '@/lib/date';
import { deferAuthSideEffect } from '@/lib/auth';
import { migrateRoutineEntriesFromEntries } from '@/lib/migrateRoutines';
import { buildRoutineCompletionMap, countCompletedRoutinesToday } from '@/lib/routineAnalysis';
import { buildTodaySummary } from '@/lib/dashboard';
import { confirmDetectedRoutine, dismissDetectedRoutine } from '@/lib/routines';

const emptyDashboard: DashboardData = {
  todayEntries: [],
  todayAiReport: null,
  weekAiReports: [],
  confirmedRoutines: [],
  unconfirmedRoutines: [],
  routineCompletionMap: {},
  recentLogs: [],
  monthMoodByDay: {},
  pastToday: [],
  todaySummary: { line: null, calories: null, moodLabel: null, routineDone: 0, routineTotal: 0 },
  booksReadThisMonth: 0,
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [entries, setEntries] = useState<TimelineEntryView[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [dashboardLoadError, setDashboardLoadError] = useState('');
  const [dataHint, setDataHint] = useState<{
    email: string;
    totalEntries: number;
    todayKst: string;
  } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const analyzingIdsRef = useRef(new Set<string>());
  const entryRawInputRef = useRef(new Map<string, string>());
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const refreshDashboard = useCallback(async (uid: string) => {
    const data = await loadDashboardData(uid);
    setDashboard(data);
    setDashboardLoadError('');
    const seen = new Set<string>();
    const uniqueEntries = data.todayEntries
      .map(toTimelineEntry)
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
    setEntries(uniqueEntries);
  }, []);

  const syncUserData = useCallback(
    async (uid: string) => {
      try {
        await migrateRoutineEntriesFromEntries(uid);
      } catch (error) {
        console.error('Routine migration skipped:', error);
      }
      try {
        await refreshDashboard(uid);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const totalEntries = await countUserEntries(uid);
        setDataHint({
          email: session?.user?.email ?? '',
          totalEntries,
          todayKst: getKstDateString(),
        });
      } catch (error) {
        console.error('Failed to load dashboard:', error);
        const message =
          error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.';
        setDashboardLoadError(message);
        setDataHint(null);
        toast.error('기록을 불러오지 못했습니다', {
          description: `${message} — F5로 새로고침하거나 설정에서 로그인 계정을 확인해주세요.`,
          duration: 10000,
        });
      }
    },
    [refreshDashboard],
  );

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      setIsLoggedIn(Boolean(user));
      setUserId(user?.id ?? null);

      if (!user) {
        setEntries([]);
        setDashboard(emptyDashboard);
        setDashboardLoadError('');
        setDataHint(null);
        return;
      }

      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED'
      ) {
        deferAuthSideEffect(() => {
          void syncUserData(user.id);
        });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [syncUserData]);

  const applyAnalysisToDashboard = useCallback((result: AnalyzeEntryResult) => {
    const { entry, savedRoutine } = result;

    setDashboard((prev) => {
      const todayEntries = prev.todayEntries.some((e) => e.id === entry.id)
        ? prev.todayEntries.map((e) => (e.id === entry.id ? entry : e))
        : [...prev.todayEntries, entry];

      let confirmedRoutines = prev.confirmedRoutines;
      if (savedRoutine) {
        const exists = confirmedRoutines.some((r) => r.id === savedRoutine.id);
        confirmedRoutines = exists
          ? confirmedRoutines.map((r) => (r.id === savedRoutine.id ? savedRoutine : r))
          : [savedRoutine, ...confirmedRoutines];
      }

      return {
        ...prev,
        todayEntries,
        confirmedRoutines,
        routineCompletionMap: buildRoutineCompletionMap(todayEntries, confirmedRoutines),
        todaySummary: buildTodaySummary(todayEntries, prev.todayAiReport, confirmedRoutines),
      };
    });
  }, []);

  const runBackgroundAnalysis = useCallback(
    async (entryId: string, rawInput: string) => {
      if (analyzingIdsRef.current.has(entryId)) return;
      analyzingIdsRef.current.add(entryId);
      entryRawInputRef.current.set(entryId, rawInput);

      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'analyzing' as const } : e)),
      );

      try {
        const result = await analyzeAndUpdateEntryWithRetry(entryId, rawInput);
        const next = toTimelineEntry(result.entry, { status: 'ready' });
        setEntries((prev) => sortTimelineEntries(prev.map((e) => (e.id === entryId ? next : e))));
        applyAnalysisToDashboard(result);
        if (userId) {
          await refreshDashboard(userId);
        }
      } catch (error) {
        console.error('Failed to analyze entry:', error);
        const message = error instanceof Error ? error.message : '';
        if (/enum entry_category.*book/i.test(message)) {
          toast.error('DB에 book 카테고리가 없습니다', {
            description:
              'Supabase SQL Editor에서 supabase/entry_category_book.sql 을 실행한 뒤 「분석 재시도」를 눌러주세요.',
            duration: 8000,
          });
        } else if (/429|quota|Gemini 호출 실패/i.test(message)) {
          toast.error('Gemini 사용 한도 초과', {
            description: '잠시 후 「분석 재시도」를 누르거나 API 요금제를 확인해주세요.',
            duration: 8000,
          });
        }
        try {
          const failed = await markEntryAnalysisFailed(entryId);
          setEntries((prev) =>
            sortTimelineEntries(
              prev.map((e) =>
                e.id === entryId ? toTimelineEntry(failed, { status: 'analysis_failed' }) : e,
              ),
            ),
          );
        } catch (markError) {
          console.error('Failed to mark analysis failed:', markError);
        }
      } finally {
        analyzingIdsRef.current.delete(entryId);
      }
    },
    [applyAnalysisToDashboard, refreshDashboard, userId],
  );

  const handleRetryAnalysis = useCallback(
    (entryId: string) => {
      const rawInput =
        entryRawInputRef.current.get(entryId) ??
        entries.find((e) => e.id === entryId)?.content ??
        '';
      if (!rawInput.trim()) return;
      void runBackgroundAnalysis(entryId, rawInput);
    },
    [entries, runBackgroundAnalysis],
  );

  const handleSubmitEntry = async (rawInput: string): Promise<boolean> => {
    if (submitLockRef.current || isSubmitting) return false;

    const trimmed = rawInput.trim();
    if (!trimmed) return false;

    const tempId = `optimistic-${crypto.randomUUID()}`;
    const optimistic = createOptimisticTimelineEntry(tempId, trimmed);

    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError('');

    setEntries((prev) => sortTimelineEntries([...prev, optimistic]));

    try {
      const entry = await createEntryRaw(trimmed);
      entryRawInputRef.current.set(entry.id, trimmed);

      setEntries((prev) =>
        sortTimelineEntries(
          prev
            .filter((e) => e.id !== tempId)
            .concat(toTimelineEntry(entry, { status: 'analyzing' })),
        ),
      );

      submitLockRef.current = false;
      setIsSubmitting(false);

      void runBackgroundAnalysis(entry.id, trimmed);

      return true;
    } catch (error) {
      console.error('Failed to save entry:', error);
      const message = error instanceof Error ? error.message : '기록 저장에 실패했습니다.';

      setEntries((prev) => prev.filter((e) => e.id !== tempId));
      setSubmitError(message);

      toast.error('저장 실패', {
        description: message,
        action: {
          label: '재시도',
          onClick: () => {
            void handleSubmitEntry(trimmed);
          },
        },
      });

      submitLockRef.current = false;
      setIsSubmitting(false);
      return false;
    }
  };

  const handleCreateManualEntry = async (input: {
    time: string;
    content: string;
  }): Promise<void> => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const entry = await createEntryManual({
        time: input.time,
        raw_input: input.content,
      });
      const next = toTimelineEntry(entry);
      setEntries((prev) => {
        if (prev.some((e) => e.id === next.id)) return prev;
        return sortTimelineEntries([...prev, next]);
      });
      if (userId) {
        await refreshDashboard(userId);
      }
    } catch (error) {
      console.error('Failed to create manual entry:', error);
      const message = error instanceof Error ? error.message : '기록 저장에 실패했습니다.';
      setSubmitError(message);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateEntry = async (
    entryId: string,
    input: { time: string; content: string },
  ): Promise<void> => {
    try {
      setSubmitError('');
      const updated = await updateEntry(entryId, {
        time: input.time,
        raw_input: input.content,
      });
      const next = toTimelineEntry(updated);
      setEntries((prev) => sortTimelineEntries([...prev.filter((e) => e.id !== entryId), next]));
      if (userId) {
        await refreshDashboard(userId);
      }
    } catch (error) {
      console.error('Failed to update entry:', error);
      const message = error instanceof Error ? error.message : '기록 수정에 실패했습니다.';
      setSubmitError(message);
      throw error;
    }
  };

  const handleDeleteEntry = async (entryId: string): Promise<void> => {
    try {
      setSubmitError('');
      await deleteEntry(entryId);
      if (userId) {
        await refreshDashboard(userId);
      }
    } catch (error) {
      console.error('Failed to delete entry:', error);
      const message = error instanceof Error ? error.message : '기록 삭제에 실패했습니다.';
      setSubmitError(message);
    }
  };

  const handleRoutineConfirmed = async () => {
    if (!userId) return;
    try {
      await refreshDashboard(userId);
    } catch (error) {
      console.error('Failed to refresh after routine confirm:', error);
    }
  };

  const handleConfirmRoutineSuggestion = async (routineId: string) => {
    try {
      await confirmDetectedRoutine(routineId);
      if (userId) await refreshDashboard(userId);
    } catch (error) {
      console.error('Failed to confirm routine suggestion:', error);
    }
  };

  const handleDismissRoutineSuggestion = async (routineId: string) => {
    try {
      await dismissDetectedRoutine(routineId);
      if (userId) await refreshDashboard(userId);
    } catch (error) {
      console.error('Failed to dismiss routine suggestion:', error);
    }
  };

  if (!isLoggedIn) {
    return <Login />;
  }

  return (
    <>
      <Toaster position="top-center" richColors closeButton />

      {isDesktop ? (
        <div className="flex size-full bg-white relative">
          <Sidebar
            onSettingsClick={() => setSettingsOpen(true)}
            recentLogs={dashboard.recentLogs}
            confirmedRoutines={dashboard.confirmedRoutines}
            unconfirmedRoutines={dashboard.unconfirmedRoutines}
            routineDone={dashboard.todaySummary.routineDone}
            routineTotal={dashboard.todaySummary.routineTotal}
            routineCompletionMap={dashboard.routineCompletionMap}
            onConfirmRoutineSuggestion={handleConfirmRoutineSuggestion}
            onDismissRoutineSuggestion={handleDismissRoutineSuggestion}
            monthMoodByDay={dashboard.monthMoodByDay}
            userId={userId}
          />

          <CenterTimeline
            entries={entries}
            onSubmitEntry={handleSubmitEntry}
            onCreateManualEntry={handleCreateManualEntry}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onRetryAnalysis={handleRetryAnalysis}
            isSubmitting={isSubmitting}
            submitError={submitError}
            dashboardLoadError={dashboardLoadError}
            dataHint={dataHint}
            todaySummary={dashboard.todaySummary}
          />

          <RightPanel
            todayAiReport={dashboard.todayAiReport}
            weekAiReports={dashboard.weekAiReports}
            todaySummary={dashboard.todaySummary}
            pastToday={dashboard.pastToday}
            booksReadThisMonth={dashboard.booksReadThisMonth}
          />

          {settingsOpen && (
            <Settings
              onClose={() => setSettingsOpen(false)}
              onRoutineConfirmed={handleRoutineConfirmed}
              userId={userId}
            />
          )}
        </div>
      ) : (
        <div className="size-full">
          <MobileSwipeView
            onSettingsClick={() => setSettingsOpen(true)}
            entries={entries}
            onSubmitEntry={handleSubmitEntry}
            onCreateManualEntry={handleCreateManualEntry}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onRetryAnalysis={handleRetryAnalysis}
            isSubmitting={isSubmitting}
            submitError={submitError}
            dashboardLoadError={dashboardLoadError}
            dataHint={dataHint}
            todaySummary={dashboard.todaySummary}
            recentLogs={dashboard.recentLogs}
            confirmedRoutines={dashboard.confirmedRoutines}
            unconfirmedRoutines={dashboard.unconfirmedRoutines}
            routineDone={dashboard.todaySummary.routineDone}
            routineTotal={dashboard.todaySummary.routineTotal}
            routineCompletionMap={dashboard.routineCompletionMap}
            onConfirmRoutineSuggestion={handleConfirmRoutineSuggestion}
            onDismissRoutineSuggestion={handleDismissRoutineSuggestion}
            monthMoodByDay={dashboard.monthMoodByDay}
            userId={userId}
            todayAiReport={dashboard.todayAiReport}
            weekAiReports={dashboard.weekAiReports}
            pastToday={dashboard.pastToday}
            booksReadThisMonth={dashboard.booksReadThisMonth}
          />
          {settingsOpen && (
            <Settings
              onClose={() => setSettingsOpen(false)}
              onRoutineConfirmed={handleRoutineConfirmed}
              userId={userId}
            />
          )}
        </div>
      )}
    </>
  );
}
