import type { RecentLogItem } from '@/lib/dashboard';

interface RecentLogsProps {
  logs: RecentLogItem[];
}

export function RecentLogs({ logs }: RecentLogsProps) {
  return (
    <div>
      <h3 className="text-[#1A1A1A] text-sm font-medium mb-3">최근 기록</h3>
      {logs.length === 0 ? (
        <p className="text-sm text-[#999999]">최근 기록이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.date}
              className="w-full text-left px-3 py-2.5 rounded-lg"
            >
              <div className="flex items-start gap-2">
                <span className="text-base">{log.mood}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#6B6B6B] mb-0.5">{log.dateLabel}</div>
                  <div className="text-sm text-[#1A1A1A] truncate">{log.summary}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
