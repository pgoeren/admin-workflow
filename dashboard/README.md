# Admin Workflow Dashboard

Real-time Vercel dashboard for the admin-workflow system. Shows heartbeat status, agent activity, task queue, token usage, and recent results.

## Local development

1. Copy env file and fill in your Firebase web app config:
   ```
   cp .env.local.example .env.local
   ```
   Get values from: Firebase Console → Project Settings → Your apps → Web app → SDK setup

2. Install and run:
   ```
   npm install
   npm run dev
   ```
   Open http://localhost:3000

## Deploy to Vercel

1. Push the `admin-workflow` repo to GitHub (if not already done).
2. Go to https://vercel.com/new and import the repo.
3. Under **Root Directory**, set it to `dashboard`.
4. Under **Environment Variables**, add all `NEXT_PUBLIC_FIREBASE_*` variables from `.env.local.example`.
5. Click **Deploy**.

Vercel will auto-deploy on every push to the default branch.

## Firebase security rules

Set these in Firebase Console → Firestore → Rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web app ID |
