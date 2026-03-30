// Pre-populate env vars needed by config.ts before any module is loaded.
// Individual test files may override these values.
process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test-secret-that-is-long-enough-ok';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@test.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'test-key';
