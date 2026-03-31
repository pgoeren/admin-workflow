'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TokenLogEntry } from '@/hooks/useTokenLog';

const AGENT_COLORS = {
  PriceHunter:      '#60a5fa',
  TripScout:        '#a78bfa',
  ExperienceFinder: '#f472b6',
  AdminAssist:      '#fb923c',
};

const AGENTS = Object.keys(AGENT_COLORS) as Array<keyof typeof AGENT_COLORS>;

interface ChartRow {
  date: string;
  PriceHunter: number;
  TripScout: number;
  ExperienceFinder: number;
  AdminAssist: number;
}

function buildChartData(entries: TokenLogEntry[], days = 7): ChartRow[] {
  const map: Record<string, Record<string, number>> = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    map[key] = { PriceHunter: 0, TripScout: 0, ExperienceFinder: 0, AdminAssist: 0 };
  }

  for (const entry of entries) {
    if (map[entry.date]) {
      map[entry.date][entry.agent] = (map[entry.date][entry.agent] ?? 0) + entry.total_tokens;
    }
  }

  return Object.entries(map).map(([date, agents]) => ({
    date: date.slice(5),
    ...agents,
  })) as ChartRow[];
}

interface TokenChartProps {
  entries: TokenLogEntry[];
  loading?: boolean;
}

export function TokenChart({ entries, loading }: TokenChartProps) {
  const data = buildChartData(entries);

  return (
    <div className="rounded-xl bg-surface border border-border p-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
        Token Usage — Last 7 Days
      </h2>

      {loading ? (
        <div className="h-48 animate-pulse bg-slate-800 rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#f1f5f9' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', color: '#64748b', paddingTop: '8px' }}
            />
            {AGENTS.map((agent) => (
              <Bar
                key={agent}
                dataKey={agent}
                stackId="tokens"
                fill={AGENT_COLORS[agent]}
                radius={agent === 'AdminAssist' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
