import * as admin from 'firebase-admin';
import config from '@/config';

let app: admin.app.App | undefined;

export function getFirestore(): FirebaseFirestore.Firestore {
  if (!app) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });
  }
  return admin.firestore();
}
