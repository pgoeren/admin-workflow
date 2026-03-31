'use client';

import dynamic from 'next/dynamic';
import { useTasks } from '@/hooks/useTasks';
import { useTokenLog } from '@/hooks/useTokenLog';
import { useConfig } from '@/hooks/useConfig';
import { HeartbeatPanel } from '@/components/HeartbeatPanel';
import { AgentCard, AGENTS } from '@/components/AgentCard';
import { TaskQueue } from '@/components/TaskQueue';
import { RecentResults } from '@/components/RecentResults';

// Recharts must be client-side only (no SSR)
const TokenChart = dynamic(
  () => import('@/components/TokenChart').then((m) => m.TokenChart),
  { ssr: false }
);

export default function DashboardPage() {
  const { tasks, loading: tasksLoading } = useTasks();
  const { entries: tokenLog, loading: tokenLoading } = useTokenLog(7);
  const { config } = useConfig();

  const paused = config?.heartbeat_paused ?? false;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-base tracking-tight">Admin Workflow</h1>
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
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        <HeartbeatPanel />

        {/* Agent Status Cards — 2 columns on mobile, 4 on wide screens */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Agent Status
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {AGENTS.map((agent) => (
              <AgentCard
                key={agent}
                agent={agent}
                tasks={tasksLoading ? [] : tasks}
                tokenLog={tokenLog}
              />
            ))}
          </div>
        </section>

        {/* Task Queue */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Task Queue
          </h2>
          <TaskQueue tasks={tasksLoading ? [] : tasks} />
        </section>

        {/* Token Usage Chart */}
        <TokenChart entries={tokenLog} loading={tokenLoading} />

        {/* Recent Results */}
        <RecentResults tasks={tasksLoading ? [] : tasks} />

      </main>
    </div>
  );
}
