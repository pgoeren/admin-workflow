import * as admin from 'firebase-admin';
import { getFirestore } from '@/db/firebase';

const TOKEN_LOG_COLLECTION = 'token_log';

export async function incrementTokenLog(agent: string, tokensUsed: number): Promise<void> {
  const db = getFirestore();
  const date = new Date().toISOString().split('T')[0];
  const docId = `${date}_${agent}`;
  await db.collection(TOKEN_LOG_COLLECTION).doc(docId).set(
    {
      date,
      agent,
      total_tokens: admin.firestore.FieldValue.increment(tokensUsed),
      run_count: admin.firestore.FieldValue.increment(1),
    },
    { merge: true }
  );
}
