import * as admin from 'firebase-admin';
import config from '@/config';

async function initFirestore() {
  const app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
  });

  const db = admin.firestore();

  console.log('Initializing Firestore collections...');

  // Create system config document
  await db.collection('config').doc('system').set({
    heartbeat_paused: false,
    morning_summary_cron: '0 7 * * *',
  }, { merge: true });
  console.log('✅ config/system created');

  // Create memory documents for each agent
  const agents = ['price-hunter', 'trip-scout', 'experience-finder', 'admin-assist', 'global'];
  for (const agent of agents) {
    await db.collection('memory').doc(agent).set({
      successful_sources: [],
      blocked_sources: [],
      user_preferences: {},
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`✅ memory/${agent} created`);
  }

  console.log('\nFirestore initialized. Collections ready: tasks, results, memory, cache, token_log, config');
  process.exit(0);
}

initFirestore().catch((err) => {
  console.error('Failed to initialize Firestore:', err);
  process.exit(1);
});
