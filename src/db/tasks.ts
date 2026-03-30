import { getFirestore } from '@/db/firebase';
import { Task, TaskStatus, ListId } from '@/db/schema';
import * as admin from 'firebase-admin';

const TASKS_COLLECTION = 'tasks';

export async function createTask(title: string, list_id: ListId): Promise<string> {
  const db = getFirestore();
  const doc = await db.collection(TASKS_COLLECTION).add({
    title,
    list_id,
    status: TaskStatus.PENDING,
    agent: null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    started_at: null,
    completed_at: null,
    tokens_used: 0,
    qa_verdict: null,
    result_path: null,
    retry_count: 0,
    heartbeat_lock: null,
    discord_message_id: null,
  });
  return doc.id;
}

export async function getTask(id: string): Promise<Task | null> {
  const db = getFirestore();
  const snap = await db.collection(TASKS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Task;
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  extra: Partial<Task> = {}
): Promise<void> {
  const db = getFirestore();
  await db.collection(TASKS_COLLECTION).doc(id).update({
    status,
    ...extra,
    ...(status === TaskStatus.RUNNING ? { started_at: admin.firestore.FieldValue.serverTimestamp() } : {}),
    ...(status === TaskStatus.COMPLETED || status === TaskStatus.FAILED
      ? { completed_at: admin.firestore.FieldValue.serverTimestamp() }
      : {}),
  });
}
