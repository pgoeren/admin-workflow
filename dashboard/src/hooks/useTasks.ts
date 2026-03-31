'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type TaskStatus = 'pending' | 'running' | 'queued' | 'completed' | 'failed';
export type QAVerdict = 'pass' | 'pass_with_notes' | 'fail' | null;

export interface Task {
  id: string;
  title: string;
  list_id: string;
  status: TaskStatus;
  agent: string | null;
  created_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  tokens_used: number;
  qa_verdict: QAVerdict;
  result_path: string | null;
  retry_count: number;
  heartbeat_lock: Timestamp | null;
  discord_message_id: string | null;
}

interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'tasks'),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Task[];
        setTasks(data);
        setLoading(false);
      },
      (err) => {
        console.error('useTasks error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { tasks, loading, error };
}
