'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface SystemConfig {
  heartbeat_paused: boolean;
  morning_summary_cron: string;
  last_heartbeat_at?: { seconds: number; nanoseconds: number } | null;
}

interface UseConfigResult {
  config: SystemConfig | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_CONFIG: SystemConfig = {
  heartbeat_paused: false,
  morning_summary_cron: '0 7 * * *',
  last_heartbeat_at: null,
};

export function useConfig(): UseConfigResult {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'config', 'system');

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          setConfig(snapshot.data() as SystemConfig);
        } else {
          setConfig(DEFAULT_CONFIG);
        }
        setLoading(false);
      },
      (err) => {
        console.error('useConfig error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { config, loading, error };
}
