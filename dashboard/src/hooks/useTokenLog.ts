'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface TokenLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  agent: string;
  total_tokens: number;
  run_count: number;
}

interface UseTokenLogResult {
  entries: TokenLogEntry[];
  loading: boolean;
  error: string | null;
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export function useTokenLog(days = 7): UseTokenLogResult {
  const [entries, setEntries] = useState<TokenLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cutoff = getDateNDaysAgo(days - 1);

    const q = query(
      collection(db, 'token_log'),
      where('date', '>=', cutoff),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TokenLogEntry[];
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        console.error('useTokenLog error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [days]);

  return { entries, loading, error };
}
