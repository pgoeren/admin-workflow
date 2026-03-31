'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Task, QAVerdict } from '@/hooks/useTasks';

const QA_BADGE: Record<NonNullable<QAVerdict>, string> = {
  pass:            'bg-green-900/60 text-green-400',
  pass_with_notes: 'bg-yellow-900/60 text-yellow-400',
  fail:            'bg-red-900/60 text-red-400',
};

const QA_LABEL: Record<NonNullable<QAVerdict>, string> = {
  pass:            '✅ Pass',
  pass_with_notes: '⚠️ Notes',
  fail:            '❌ Fail',
};

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
        setOutput(snap.exists() ? (snap.data() as { output: string }).output : 'No result found.');
      } catch (err) {
        setOutput(`Error: ${err}`);
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
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg" aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-border rounded w-3/4" />
              <div className="h-3 bg-border rounded w-1/2" />
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

interface RecentResultsProps {
  tasks: Task[];
}

export function RecentResults({ tasks }: RecentResultsProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const completed = tasks
    .filter((t) => t.status === 'completed' && t.completed_at)
    .sort((a, b) => (b.completed_at?.seconds ?? 0) - (a.completed_at?.seconds ?? 0))
    .slice(0, 5);

  return (
    <>
      <div className="rounded-xl bg-surface border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Recent Results
          </h2>
        </div>

        <div className="divide-y divide-border">
          {completed.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">No completed tasks yet</p>
          ) : (
            completed.map((task) => (
              <div
                key={task.id}
                className="px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => setSelectedTask(task)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {task.agent ?? 'Unknown agent'}
                      {task.completed_at && ` · ${formatTime(task.completed_at.seconds)}`}
                    </p>
                  </div>
                  {task.qa_verdict && (
                    <span
                      className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${QA_BADGE[task.qa_verdict]}`}
                    >
                      {QA_LABEL[task.qa_verdict]}
                    </span>
                  )}
                </div>
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
