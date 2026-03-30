import crypto from 'crypto';
import { getFirestore } from '@/db/firebase';
import * as admin from 'firebase-admin';

const CACHE_COLLECTION = 'cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function computeCacheKey(listId: string, title: string): string {
  const normalized = `${listId}:${title.toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function getCachedResult(
  listId: string,
  title: string
): Promise<{ result_path: string; task_id: string } | null> {
  // Bypass cache if title starts with !fresh
  if (title.startsWith('!fresh')) return null;

  const key = computeCacheKey(listId, title);
  const db = getFirestore();
  const snap = await db.collection(CACHE_COLLECTION).doc(key).get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  const createdAt: Date = data.created_at.toDate();
  if (Date.now() - createdAt.getTime() > CACHE_TTL_MS) return null;

  return { result_path: data.result_path, task_id: data.task_id };
}

export async function setCachedResult(
  listId: string,
  title: string,
  taskId: string,
  resultPath: string
): Promise<void> {
  const key = computeCacheKey(listId, title);
  const db = getFirestore();
  await db.collection(CACHE_COLLECTION).doc(key).set({
    cache_key: key,
    task_id: taskId,
    result_path: resultPath,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}
