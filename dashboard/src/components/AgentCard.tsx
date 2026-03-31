'use client';

import { Task } from '@/hooks/useTasks';
import { TokenLogEntry } from '@/hooks/useTokenLog';

export const AGENTS = ['PriceHunter', 'TripScout', 'ExperienceFinder', 'AdminAssist'] as const;
export type AgentName = typeof AGENTS[number];

const AGENT_COLORS: Record<AgentName, string> = {
  PriceHunter:      'text-blue-400',
  TripScout:        'text-purple-400',
  ExperienceFinder: 'text-pink-400',
  AdminAssist:      'text-orange-400',
};

const AGENT_ICONS: Record<AgentName, string> = {
  PriceHunter:      '🛒',
  TripScout:        '✈️',
  ExperienceFinder: '📅',
  AdminAssist:      '🗂️',
};

interface AgentCardProps {
  agent: AgentName;
  tasks: Task[];
  tokenLog: TokenLogEntry[];
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function AgentCard({ agent, tasks, tokenLog }: AgentCardProps) {
  const today = getTodayString();

  const todayEntry = tokenLog.find(
    (e) => e.agent === agent && e.date === today
  );
  const todayTokens = todayEntry?.total_tokens ?? 0;
  const todayRuns = todayEntry?.run_count ?? 0;

  const isRunning = tasks.some(
    (t) => t.agent === agent && t.status === 'running'
  );

  return (
    <div className="rounded-xl bg-surface border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{AGENT_ICONS[agent]}</span>
          <span className={`font-semibold text-sm ${AGENT_COLORS[agent]}`}>
            {agent}
          </span>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isRunning
              ? 'bg-blue-900/50 text-blue-400 animate-pulse'
              : 'bg-slate-700 text-muted'
          }`}
        >
          {isRunning ? 'Running' : 'Idle'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-800 px-3 py-2">
          <dt className="text-muted text-xs mb-0.5">Tokens Today</dt>
          <dd className="font-mono font-semibold text-foreground">
            {todayTokens.toLocaleString()}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-800 px-3 py-2">
          <dt className="text-muted text-xs mb-0.5">Runs Today</dt>
          <dd className="font-mono font-semibold text-foreground">{todayRuns}</dd>
        </div>
      </dl>
    </div>
  );
}
