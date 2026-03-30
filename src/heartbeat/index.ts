import * as admin from 'firebase-admin';
import { getFirestore } from '@/db/firebase';
import { Task, TaskStatus, ListId } from '@/db/schema';
import { runAgent } from '@/agents/runner';
import { formatResultMessage } from '@/discord/delivery';

const TASKS_COLLECTION = 'tasks';
const RESULTS_COLLECTION = 'results';
const LOCK_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

export async function releaseHeartbeatLock(taskId: string): Promise<void> {
  const db = getFirestore();
  await db.collection(TASKS_COLLECTION).doc(taskId).update({ heartbeat_lock: null });
}

export async function claimNextTask(): Promise<Task | null> {
  const db = getFirestore();

  const snapshot = await db
    .collection(TASKS_COLLECTION)
    .where('status', 'in', [TaskStatus.PENDING, TaskStatus.QUEUED])
    .orderBy('status', 'asc')
    .orderBy('created_at', 'asc')
    .get();

  const now = Date.now();

  for (const doc of snapshot.docs) {
    const data = doc.data() as Task;
    const lockTime = data.heartbeat_lock ? data.heartbeat_lock.toDate().getTime() : null;
    const lockExpired = lockTime === null || now - lockTime > LOCK_TIMEOUT_MS;
    if (!lockExpired) continue;

    try {
      const claimed = await db.runTransaction(async (tx: any) => {
        const fresh = await tx.get(db.collection(TASKS_COLLECTION).doc(doc.id));
        if (!fresh.exists) return null;
        const freshData = fresh.data() as Task;
        const freshLockTime = freshData.heartbeat_lock ? freshData.heartbeat_lock.toDate().getTime() : null;
        const freshLockExpired = freshLockTime === null || now - freshLockTime > LOCK_TIMEOUT_MS;
        if (!freshLockExpired) return null;
        tx.update(db.collection(TASKS_COLLECTION).doc(doc.id), {
          heartbeat_lock: admin.firestore.FieldValue.serverTimestamp(),
        });
        const { id: _id, ...restFreshData } = freshData;
        return { id: doc.id, ...restFreshData } as Task;
      });
      if (claimed) return claimed;
    } catch {
      continue;
    }
  }

  return null;
}

interface HeartbeatResult {
  taskId: string;
  title: string;
  discordMessage: string;
}

export async function processHeartbeat(): Promise<HeartbeatResult | null> {
  const db = getFirestore();

  const configSnap = await db.collection('config').doc('system').get();
  if (configSnap.exists && configSnap.data()?.heartbeat_paused === true) {
    return null;
  }

  const task = await claimNextTask();
  if (!task) return null;

  await runAgent({ taskId: task.id, title: task.title, listId: task.list_id as ListId });

  const updatedSnap = await db.collection(TASKS_COLLECTION).doc(task.id).get();
  const updatedData = updatedSnap.exists ? updatedSnap.data() : undefined;
  const { id: _uid, ...restUpdatedData } = (updatedData ?? {}) as Task;
  const updated = updatedSnap.exists ? ({ id: updatedSnap.id, ...restUpdatedData } as Task) : task;

  const resultSnap = await db
    .collection(RESULTS_COLLECTION)
    .where('task_id', '==', task.id)
    .get();

  const resultData = resultSnap.empty ? null : resultSnap.docs[0].data();

  const discordMessage = formatResultMessage({
    title: task.title,
    agentName: updated.agent ?? 'unknown',
    qaVerdict: updated.qa_verdict ?? ('unknown' as any),
    output: resultData?.output ?? '(no output)',
    sources: resultData?.sources ?? [],
  });

  return { taskId: task.id, title: task.title, discordMessage };
}
