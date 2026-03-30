import { getFirestore } from '@/db/firebase';
import { TaskStatus } from '@/db/schema';
import { updateTaskStatus } from '@/db/tasks';
import { updateMemoryAfterRun } from '@/memory/index';
import { getClaudeClient, MODELS } from '@/claude';

const PREFERENCE_EXTRACTION_PROMPT = `You extract user preferences from feedback messages about research tasks.
Output ONLY valid JSON:
{ "scope": "global" | "agent", "agentName": "<string, only if scope=agent>", "preference": "<concise preference string>" }
No explanation.`;

export async function processReaction(taskId: string, emoji: string): Promise<void> {
  const db = getFirestore();

  if (emoji === '✅' || emoji === '❌') {
    const taskSnap = await db.collection('tasks').doc(taskId).get();
    if (!taskSnap.exists) return;
    const task = taskSnap.data()!;
    const agentName: string = task.agent ?? 'unknown';

    const resultSnap = await db.collection('results').where('task_id', '==', taskId).get();
    if (resultSnap.empty) return;

    const sources: Array<{ url: string }> = resultSnap.docs[0].data().sources ?? [];
    const urls = sources.map(s => s.url);

    if (emoji === '✅') {
      await updateMemoryAfterRun(agentName, urls, []);
    } else {
      await updateMemoryAfterRun(agentName, [], urls);
    }
    return;
  }

  if (emoji === '🔄') {
    const cacheSnap = await db.collection('cache').where('task_id', '==', taskId).get();
    await Promise.all(cacheSnap.docs.map(d => d.ref.delete()));
    await updateTaskStatus(taskId, TaskStatus.QUEUED);
    return;
  }
  // Unknown emoji — do nothing
}

export async function processReply(taskId: string, replyText: string): Promise<void> {
  const db = getFirestore();

  const taskSnap = await db.collection('tasks').doc(taskId).get();
  const agentName: string = taskSnap.exists ? (taskSnap.data()!.agent ?? 'unknown') : 'unknown';

  const client = getClaudeClient();
  const response = await client.messages.create({
    model: MODELS.HAIKU,
    max_tokens: 256,
    system: PREFERENCE_EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: replyText }],
  });

  let parsed: { scope: string; agentName?: string; preference: string };
  try {
    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  const { scope, preference } = parsed;
  const targetDoc = scope === 'agent' ? (parsed.agentName ?? agentName) : 'global';

  await db.collection('memory').doc(targetDoc).set(
    { user_preferences: { [Date.now().toString()]: preference } },
    { merge: true }
  );
}
