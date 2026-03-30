import { Timestamp } from 'firebase-admin/firestore';

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  QUEUED = 'queued',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum QAVerdict {
  PASS = 'pass',
  PASS_WITH_NOTES = 'pass_with_notes',
  FAIL = 'fail',
}

export type ListId = 'price-hunt' | 'trip-planner' | 'experience-scout' | 'admin';

export interface Task {
  id: string;
  title: string;
  list_id: ListId;
  status: TaskStatus;
  agent: string | null;
  created_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  tokens_used: number;
  qa_verdict: QAVerdict | null;
  result_path: string | null;
  retry_count: number;
  heartbeat_lock: Timestamp | null;
  discord_message_id: string | null;
}

export interface Result {
  task_id: string;
  agent: string;
  output: string;
  sources: Array<{ url: string; title: string; retrieved_at: Timestamp }>;
  qa_notes: string | null;
  created_at: Timestamp;
}

export interface AgentMemory {
  successful_sources: string[];
  blocked_sources: string[];
  user_preferences: Record<string, unknown>;
  last_updated: Timestamp | null;
}

export interface CacheEntry {
  cache_key: string;
  task_id: string;
  result_path: string;
  created_at: Timestamp;
}

export interface TokenLog {
  date: string; // YYYY-MM-DD
  agent: string;
  total_tokens: number;
  run_count: number;
}

export interface SystemConfig {
  heartbeat_paused: boolean;
  morning_summary_cron: string; // cron expression, default '0 7 * * *'
}
