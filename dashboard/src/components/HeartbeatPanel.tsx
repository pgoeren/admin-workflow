'use client';

import { useConfig } from '@/hooks/useConfig';

function formatTimestamp(seconds: number): string {
  const d = new Date(seconds * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getNextRunTime(): string {
  // Heartbeat runs at :03 and :33 past each hour
  const now = new Date();
  const mins = now.getMinutes();
  const nextMins = mins < 3 ? 3 : mins < 33 ? 33 : 63; // 63 = next hour :03
  const next = new Date(now);
  if (nextMins === 63) {
    next.setHours(now.getHours() + 1);
    next.setMinutes(3);
  } else {
    next.setMinutes(nextMins);
  }
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function HeartbeatPanel() {
  const { config, loading } = useConfig();

  if (loading) {
    return (
      <div className="rounded-xl bg-surface border border-border p-4 animate-pulse">
        <div className="h-4 bg-border rounded w-1/3 mb-2" />
        <div className="h-3 bg-border rounded w-1/2" />
      </div>
    );
  }

  const paused = config?.heartbeat_paused ?? false;
  const lastRun = config?.last_heartbeat_at
    ? formatTimestamp(config.last_heartbeat_at.seconds)
    : 'Never';
  const nextRun = paused ? '—' : getNextRunTime();

  return (
    <div className="rounded-xl bg-surface border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
          Heartbeat
        </h2>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            paused
              ? 'bg-yellow-900/50 text-yellow-400'
              : 'bg-green-900/50 text-green-400'
          }`}
        >
          <span className="text-base leading-none">{paused ? '⏸' : '🟢'}</span>
          {paused ? 'Paused' : 'Active'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted text-xs mb-0.5">Last Run</dt>
          <dd className="font-mono text-foreground">{lastRun}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs mb-0.5">Next Run</dt>
          <dd className="font-mono text-foreground">{nextRun}</dd>
        </div>
      </dl>
    </div>
  );
}
