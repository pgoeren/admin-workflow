'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Task, TaskStatus } from '@/hooks/useTasks';

type Tab = 'pending' | 'running' | 'completed' | 'failed';

const TABS: { label: string; value: Tab }[] = [
  { label: 'Pending',   value: 'pending' },
  { label: 'Running',   value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed',    value: 'failed' },
];

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending:   'bg-slate-700 text-slate-300',
  running:   'bg-blue-900/60 text-blue-400',
  queued:    'bg-yellow-900/60 text-yellow-400',
  completed: 'bg-green-900/60 text-green-400',
  failed:    'bg-red-900/60 text-red-400',
};

const LIST_LABELS: Record<string, string> = {
  'price-hunt':       '🛒 Price Hunt',
  'trip-planner':     '✈️ Trip Planner',
  'experience-scout': '📅 Experience',
  'admin':            '🗂️ Admin',
};

function formatRelativeTime(seconds: number): string {
  const diff = Math.floor((Date.now() / 1000) - seconds);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface ResultModalProps {
  taskId: string;
  title: string;
  onClose: () => void;
}

function ResultModal({ taskId, title, onClose }: ResultModalProps) {
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, 'results', taskId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setOutput((snap.data() as { output: string }).output);
        } else {
          setOutput('No result document found for this task.');
        }
      } catch (err) {
        setOutput(`Error loading result: ${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm truncate pr-4">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-border rounded w-3/4" />
              <div className="h-3 bg-border rounded w-1/2" />
              <div className="h-3 bg-border rounded w-2/3" />
            </div>
          ) : (
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
              {output}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

interface TaskQueueProps {
  tasks: Task[];
}

export function TaskQueue({ tasks }: TaskQueueProps) {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const filtered = tasks.filter((t) => {
    if (activeTab === 'pending') return t.status === 'pending' || t.status === 'queued';
    return t.status === activeTab;
  });

  const tabCounts: Record<Tab, number> = {
    pending:   tasks.filter((t) => t.status === 'pending' || t.status === 'queued').length,
    running:   tasks.filter((t) => t.status === 'running').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed:    tasks.filter((t) => t.status === 'failed').length,
  };

  return (
    <>
      <div className="rounded-xl bg-surface border border-border overflow-hidden">
        <div className="flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.value
                  ? 'text-foreground border-b-2 border-accent bg-slate-800/50'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {tab.label}
              {tabCounts[tab.value] > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-xs">
                  {tabCounts[tab.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="divide-y divide-border">
          {filtered.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">No tasks</p>
          ) : (
            filtered.map((task) => (
              <div
                key={task.id}
                className={`px-4 py-3 flex items-start justify-between gap-3 ${
                  task.status === 'completed'
                    ? 'cursor-pointer hover:bg-slate-800/50 transition-colors'
                    : ''
                }`}
                onClick={() =>
                  task.status === 'completed' ? setSelectedTask(task) : undefined
                }
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {LIST_LABELS[task.list_id] ?? task.list_id}
                    {task.agent && ` · ${task.agent}`}
                    {' · '}
                    {task.created_at
                      ? formatRelativeTime(task.created_at.seconds)
                      : ''}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[task.status]}`}
                >
                  {task.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTask && (
        <ResultModal
          taskId={selectedTask.id}
          title={selectedTask.title}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}
