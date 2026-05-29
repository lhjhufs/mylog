import { Sidebar } from './components/Sidebar';
import { CenterTimeline } from './components/CenterTimeline';
import { RightPanel } from './components/RightPanel';
import { Login } from './components/Login';
import { Settings } from './components/Settings';
import { MobileSwipeView } from './components/MobileSwipeView';
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
  createEntryManual,
  createOptimisticTimelineEntry,
  deleteEntry,
  sortTimelineEntries,
  updateEntry,
  toTimelineEntry,
  type TimelineEntryView,
} from '@/lib/entries';
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
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [entries, setEntries] = useState<TimelineEntryView[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const analyzingIdsRef = useRef(new Set<string>());
  const entryRawInputRef = useRef(new Map<string, string>());

  const refreshDashboard = useCallback(async (uid: string) => {
    const data = await loadDashboardData(uid);
    setDashboard(data);
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

  useEffect(() => {
    const bootstrap = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user ?? null;
      setIsLoggedIn(Boolean(user));
      setUserId(user?.id ?? null);

      if (user) {
        try {
          await migrateRoutineEntriesFromEntries(user.id);
          await refreshDashboard(user.id);
        } catch (error) {
          console.error('Failed to load dashboard:', error);
        }
      }
    };

    bootstrap();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;
      setIsLoggedIn(Boolean(user));
      setUserId(user?.id ?? null);
      if (!user) {
        setEntries([]);
        setDashboard(emptyDashboard);
        return;
      }
      // INITIAL_SESSION은 bootstrap에서 이미 로드함 — 중복 요청 방지
      if (event === 'INITIAL_SESSION') return;
      try {
        await migrateRoutineEntriesFromEntries(user.id);
        await refreshDashboard(user.id);
      } catch (error) {
        console.error('Failed to sync dashboard after auth change:', error);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [refreshDashboard]);

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
      <div className="hidden lg:flex size-full bg-white relative">
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
          todaySummary={dashboard.todaySummary}
        />

        <RightPanel
          todayAiReport={dashboard.todayAiReport}
          weekAiReports={dashboard.weekAiReports}
          todaySummary={dashboard.todaySummary}
          pastToday={dashboard.pastToday}
        />

        {settingsOpen && (
          <Settings
            onClose={() => setSettingsOpen(false)}
            onRoutineConfirmed={handleRoutineConfirmed}
          />
        )}
      </div>

      <div className="lg:hidden size-full">
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
        />
        {settingsOpen && (
          <Settings
            onClose={() => setSettingsOpen(false)}
            onRoutineConfirmed={handleRoutineConfirmed}
          />
        )}
      </div>
    </>
  );
}
