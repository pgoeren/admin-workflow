import { getFirestore } from '@/db/firebase';
import { Task, TaskStatus } from '@/db/schema';
import * as admin from 'firebase-admin';

const QUOTES = [
  'Focus on being productive instead of busy. — Tim Ferriss',
  'The secret of getting ahead is getting started. — Tony Robbins',
  'If you set goals and go after them with all the determination you can muster, your gifts will take you places that will amaze you. — Tony Robbins',
  'What we can or cannot do, what we consider possible or impossible, is rarely a function of our true capability. — Tony Robbins',
  'You are the average of the five people you spend the most time with. — Tim Ferriss',
  "A person's success in life can usually be measured by the number of uncomfortable conversations he or she is willing to have. — Tim Ferriss",
  'The quality of your life is the quality of your relationships. — Tony Robbins',
  'Losers react; leaders anticipate. — Tony Robbins',
  "Conditions are never perfect. 'Someday' is a disease that will take your dreams to the grave with you. — Tim Ferriss",
  "It's not about the goal. It's about growing to become the person that can accomplish that goal. — Tony Robbins",
];

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export async function generateMorningSummary(): Promise<string> {
  const db = getFirestore();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoff);

  const snapshot = await db
    .collection('tasks')
    .where('created_at', '>=', cutoffTimestamp)
    .orderBy('created_at', 'desc')
    .get();

  const tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task));

  const counts: Record<string, number> = {
    [TaskStatus.COMPLETED]: 0,
    [TaskStatus.FAILED]: 0,
    [TaskStatus.PENDING]: 0,
    [TaskStatus.RUNNING]: 0,
    [TaskStatus.QUEUED]: 0,
  };
  for (const t of tasks) {
    if (t.status in counts) counts[t.status]++;
  }

  const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED).slice(0, 5);
  const date = now.toISOString().split('T')[0];
  const quote = QUOTES[getDayOfYear(now) % QUOTES.length];

  const completionsBlock =
    completedTasks.length > 0
      ? `\nRecent completions:\n${completedTasks.map(t => `• ${t.title}${t.agent ? ` (${t.agent})` : ''}`).join('\n')}`
      : '';

  const msg = [
    `**Admin Workflow — Morning Summary** (${date})`,
    '',
    'Tasks in last 24h:',
    `• ✅ Completed: ${counts[TaskStatus.COMPLETED]}`,
    `• ❌ Failed: ${counts[TaskStatus.FAILED]}`,
    `• ⏳ Pending: ${counts[TaskStatus.PENDING]}`,
    `• 🔄 Running: ${counts[TaskStatus.RUNNING]}`,
    completionsBlock,
    '',
    '---',
    `💬 "${quote}"`,
  ].join('\n').trim();

  return msg.length <= 2000 ? msg : msg.slice(0, 1997) + '...';
}
