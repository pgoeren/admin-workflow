import fs from 'fs';
import path from 'path';
import { getFirestore } from '@/db/firebase';
import config from '@/config';
import * as admin from 'firebase-admin';

interface SaveResultInput {
  taskId: string;
  agent: string;
  output: string;
  sources: Array<{ url: string; title: string; retrieved_at: Date }>;
  qaNotes: string | null;
}

export async function saveResult(input: SaveResultInput): Promise<string> {
  const { taskId, agent, output, sources, qaNotes } = input;

  // Save markdown file locally
  const date = new Date().toISOString().split('T')[0];
  const dir = path.join(config.resultsDir, date);
  const filePath = path.join(dir, `${taskId}.md`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, output, 'utf8');

  // Save to Firestore
  const db = getFirestore();
  const doc = await db.collection('results').add({
    task_id: taskId,
    agent,
    output,
    sources: sources.map(s => ({
      url: s.url,
      title: s.title,
      retrieved_at: admin.firestore.Timestamp.fromDate(s.retrieved_at),
    })),
    qa_notes: qaNotes,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return doc.id;
}
