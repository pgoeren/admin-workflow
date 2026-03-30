# Admin Workflow — Plan 4: Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a phone-accessible, real-time dashboard on Vercel that shows heartbeat status, agent activity, task queue, token usage, and recent results — all driven by live Firestore reads.

**Architecture:** A Next.js 14 (App Router) single-page application lives in `dashboard/` at the root of the existing `admin-workflow` repo. It uses the Firebase **client** SDK with `onSnapshot` listeners for real-time updates. The dashboard is read-only — no writes. Vercel is pointed at the `dashboard/` subfolder as its root directory.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Recharts, Firebase client SDK (`firebase/app`, `firebase/firestore`)

**Prerequisites:** Plans 1–3 must be complete (Firestore is populated with `tasks`, `token_log`, and `config/system` documents before the dashboard is useful).

---

## Sub-Project Roadmap

- **Plan 1: Foundation** — project scaffold, webhook server, Firestore schema
- **Plan 2: Agent System** — efficiency layer, memory, 4 research agents, QA agent
- **Plan 3: Orchestration** — heartbeat processor, Discord delivery, feedback loop, morning summary
- **Plan 4: Dashboard** ← you are here
- **Plan 5: Apple Shortcuts** — macOS Shortcut configuration guide for 4 reminder lists

---

## File Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout: HTML shell, dark background, fonts
│   │   ├── page.tsx            # Main dashboard — assembles all sections
│   │   └── globals.css         # Tailwind base + any global overrides
│   ├── components/
│   │   ├── HeartbeatPanel.tsx  # Status badge + last run + next run countdown
│   │   ├── AgentCard.tsx       # Per-agent token count, run count, status
│   │   ├── TaskQueue.tsx       # Tabbed table: Pending | Running | Completed | Failed
│   │   ├── TokenChart.tsx      # Recharts stacked bar — last 7 days by agent
│   │   └── RecentResults.tsx   # Last 5 completed tasks with QA badge + result modal
│   ├── hooks/
│   │   ├── useTasks.ts         # onSnapshot for entire tasks collection
│   │   ├── useTokenLog.ts      # onSnapshot for token_log, filtered to last 7 days
│   │   └── useConfig.ts        # onSnapshot for config/system document
│   └── lib/
│       └── firebase.ts         # Firebase client app + Firestore instance (singleton)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── postcss.config.js
└── .env.local.example
```

---

## Shared Types (dashboard-local)

Because the main project uses `firebase-admin` types, the dashboard defines its own client-side equivalents using `firebase/firestore` `Timestamp`. These are declared inline where needed — no shared `schema.ts` is imported from `../src/`.

```typescript
// Used across dashboard components
export type TaskStatus = 'pending' | 'running' | 'queued' | 'completed' | 'failed';
export type QAVerdict = 'pass' | 'pass_with_notes' | 'fail' | null;

export interface Task {
  id: string;
  title: string;
  list_id: string;
  status: TaskStatus;
  agent: string | null;
  created_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  tokens_used: number;
  qa_verdict: QAVerdict;
  result_path: string | null;
  retry_count: number;
  heartbeat_lock: Timestamp | null;
  discord_message_id: string | null;
}

export interface TokenLogEntry {
  date: string; // YYYY-MM-DD
  agent: string;
  total_tokens: number;
  run_count: number;
}

export interface SystemConfig {
  heartbeat_paused: boolean;
  morning_summary_cron: string;
}
```

---

## Task 1: Scaffold Next.js App in `dashboard/`

**Goal:** Initialize the Next.js 14 project with Tailwind CSS, TypeScript, and all required dependencies.

**Files created:**
- `dashboard/package.json`
- `dashboard/tsconfig.json`
- `dashboard/next.config.ts`
- `dashboard/tailwind.config.ts`
- `dashboard/postcss.config.js`
- `dashboard/src/app/globals.css`

- [ ] **Step 1: Create the `dashboard/` directory and initialize the Next.js app**

```bash
cd "Claude Coding Projects/admin-workflow"
mkdir -p dashboard
cd dashboard
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
```

When prompted, accept all defaults. The `--no-git` flag prevents creating a nested git repo.

- [ ] **Step 2: Install additional dependencies**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm install firebase recharts
npm install --save-dev @types/node
```

- [ ] **Step 3: Verify `package.json` scripts**

Confirm `dashboard/package.json` contains:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

- [ ] **Step 4: Write `next.config.ts`**

Replace the generated `next.config.ts` (or `next.config.mjs`) with:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // No special config needed — Vercel auto-detects Next.js
};

export default nextConfig;
```

- [ ] **Step 5: Write `dashboard/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #0f172a;
  --foreground: #f1f5f9;
}

body {
  background-color: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 6: Write `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        surface: '#1e293b',
        border: '#334155',
        muted: '#64748b',
        accent: '#6366f1',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p "Claude Coding Projects/admin-workflow/dashboard/src/components"
mkdir -p "Claude Coding Projects/admin-workflow/dashboard/src/hooks"
mkdir -p "Claude Coding Projects/admin-workflow/dashboard/src/lib"
```

- [ ] **Step 8: Verify build passes on the empty scaffold**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run build
```

Expected: build completes with no TypeScript errors. The generated `app/page.tsx` placeholder is fine at this stage.

---

## Task 2: Firebase Client Init + Env Vars Example

**Goal:** Initialize the Firebase client SDK once (singleton pattern) and document all required environment variables.

**Files created:**
- `dashboard/src/lib/firebase.ts`
- `dashboard/.env.local.example`

- [ ] **Step 1: Write `dashboard/src/lib/firebase.ts`**

```typescript
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

function getFirebaseApp(): FirebaseApp {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

export const app: FirebaseApp = getFirebaseApp();
export const db: Firestore = getFirestore(app);
```

**Note on credentials:** The Firebase client config (`NEXT_PUBLIC_FIREBASE_*`) is the web app config found in the Firebase Console under **Project Settings → General → Your apps → Web app → SDK setup and configuration**. This is different from the Admin SDK service account key used by the server. The client config is safe to expose in browser code — Firebase security rules protect the data.

- [ ] **Step 2: Write `dashboard/.env.local.example`**

```
# Firebase client SDK config (NOT the Admin SDK service account)
# Get these from: Firebase Console → Project Settings → Your apps → Web app
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

- [ ] **Step 3: Create `dashboard/.env.local` from the example**

```bash
cp "Claude Coding Projects/admin-workflow/dashboard/.env.local.example" \
   "Claude Coding Projects/admin-workflow/dashboard/.env.local"
```

Then fill in the actual values from the Firebase Console. This file is gitignored by Next.js by default.

- [ ] **Step 4: Confirm `.env.local` is gitignored**

The root `admin-workflow/.gitignore` should already contain `*.env.local` or Next.js's default `.gitignore` inside `dashboard/` covers it. Verify:

```bash
cat "Claude Coding Projects/admin-workflow/dashboard/.gitignore" | grep env
```

Expected output includes `.env*.local`. If not present, add it.

- [ ] **Step 5: Set Firestore security rules (one-time manual step)**

In the Firebase Console → Firestore Database → Rules, set:
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

This allows the dashboard to read all documents but prevents any browser-side writes.

---

## Task 3: Firestore Hooks (`useTasks`, `useTokenLog`, `useConfig`)

**Goal:** Three React hooks that use `onSnapshot` for real-time Firestore subscriptions. Each hook returns typed data and a loading flag.

**Files created:**
- `dashboard/src/hooks/useTasks.ts`
- `dashboard/src/hooks/useTokenLog.ts`
- `dashboard/src/hooks/useConfig.ts`

- [ ] **Step 1: Write `dashboard/src/hooks/useTasks.ts`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type TaskStatus = 'pending' | 'running' | 'queued' | 'completed' | 'failed';
export type QAVerdict = 'pass' | 'pass_with_notes' | 'fail' | null;

export interface Task {
  id: string;
  title: string;
  list_id: string;
  status: TaskStatus;
  agent: string | null;
  created_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  tokens_used: number;
  qa_verdict: QAVerdict;
  result_path: string | null;
  retry_count: number;
  heartbeat_lock: Timestamp | null;
  discord_message_id: string | null;
}

interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'tasks'),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Task[];
        setTasks(data);
        setLoading(false);
      },
      (err) => {
        console.error('useTasks error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { tasks, loading, error };
}
```

- [ ] **Step 2: Write `dashboard/src/hooks/useTokenLog.ts`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface TokenLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  agent: string;
  total_tokens: number;
  run_count: number;
}

interface UseTokenLogResult {
  entries: TokenLogEntry[];
  loading: boolean;
  error: string | null;
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export function useTokenLog(days = 7): UseTokenLogResult {
  const [entries, setEntries] = useState<TokenLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cutoff = getDateNDaysAgo(days - 1);

    const q = query(
      collection(db, 'token_log'),
      where('date', '>=', cutoff),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TokenLogEntry[];
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        console.error('useTokenLog error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [days]);

  return { entries, loading, error };
}
```

- [ ] **Step 3: Write `dashboard/src/hooks/useConfig.ts`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface SystemConfig {
  heartbeat_paused: boolean;
  morning_summary_cron: string;
  last_heartbeat_at?: { seconds: number; nanoseconds: number } | null;
}

interface UseConfigResult {
  config: SystemConfig | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_CONFIG: SystemConfig = {
  heartbeat_paused: false,
  morning_summary_cron: '0 7 * * *',
  last_heartbeat_at: null,
};

export function useConfig(): UseConfigResult {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'config', 'system');

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          setConfig(snapshot.data() as SystemConfig);
        } else {
          setConfig(DEFAULT_CONFIG);
        }
        setLoading(false);
      },
      (err) => {
        console.error('useConfig error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { config, loading, error };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run build
```

Expected: no TypeScript errors in the hooks. If Firestore complains about composite index requirements for `useTokenLog` (the `where` + `orderBy` query), the browser console will show a link to create the index — click it once.

---

## Task 4: HeartbeatPanel Component

**Goal:** Display heartbeat active/paused status, last run time, and next scheduled run time. Updates in real time via `useConfig`.

**Files created:**
- `dashboard/src/components/HeartbeatPanel.tsx`

- [ ] **Step 1: Write `dashboard/src/components/HeartbeatPanel.tsx`**

```typescript
'use client';

import { useConfig } from '@/hooks/useConfig';

function formatTimestamp(seconds: number): string {
  const d = new Date(seconds * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getNextRunTime(): string {
  // Heartbeat runs at :03 and :33 past each hour
  const now = new Date();
  const mins = now.getMinutes();
  const nextMins = mins < 3 ? 3 : mins < 33 ? 33 : 63; // 63 = next hour :03
  const next = new Date(now);
  if (nextMins === 63) {
    next.setHours(now.getHours() + 1);
    next.setMinutes(3);
  } else {
    next.setMinutes(nextMins);
  }
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function HeartbeatPanel() {
  const { config, loading } = useConfig();

  if (loading) {
    return (
      <div className="rounded-xl bg-surface border border-border p-4 animate-pulse">
        <div className="h-4 bg-border rounded w-1/3 mb-2" />
        <div className="h-3 bg-border rounded w-1/2" />
      </div>
    );
  }

  const paused = config?.heartbeat_paused ?? false;
  const lastRun = config?.last_heartbeat_at
    ? formatTimestamp(config.last_heartbeat_at.seconds)
    : 'Never';
  const nextRun = paused ? '—' : getNextRunTime();

  return (
    <div className="rounded-xl bg-surface border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
          Heartbeat
        </h2>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            paused
              ? 'bg-yellow-900/50 text-yellow-400'
              : 'bg-green-900/50 text-green-400'
          }`}
        >
          <span className="text-base leading-none">{paused ? '⏸' : '🟢'}</span>
          {paused ? 'Paused' : 'Active'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted text-xs mb-0.5">Last Run</dt>
          <dd className="font-mono text-foreground">{lastRun}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs mb-0.5">Next Run</dt>
          <dd className="font-mono text-foreground">{nextRun}</dd>
        </div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run build
```

- [ ] **Step 3: Visual check instructions**

```bash
npm run dev
```

Open `http://localhost:3000`. The HeartbeatPanel will not render yet (it's not assembled into `page.tsx` until Task 9), but you can temporarily import and render it in `app/page.tsx` to confirm: the panel shows the correct paused/active badge, last run time, and next run time. If `config/system` does not yet exist in Firestore, the panel shows "Never" for last run and defaults to Active.

---

## Task 5: AgentCard Components

**Goal:** One card per agent showing today's token usage, today's run count, and current status (idle/running). Reads from `useTokenLog` and `useTasks`.

**Files created:**
- `dashboard/src/components/AgentCard.tsx`

- [ ] **Step 1: Write `dashboard/src/components/AgentCard.tsx`**

```typescript
'use client';

import { Task } from '@/hooks/useTasks';
import { TokenLogEntry } from '@/hooks/useTokenLog';

export const AGENTS = ['PriceHunter', 'TripScout', 'ExperienceFinder', 'AdminAssist'] as const;
export type AgentName = typeof AGENTS[number];

const AGENT_COLORS: Record<AgentName, string> = {
  PriceHunter:      'text-blue-400',
  TripScout:        'text-purple-400',
  ExperienceFinder: 'text-pink-400',
  AdminAssist:      'text-orange-400',
};

const AGENT_ICONS: Record<AgentName, string> = {
  PriceHunter:      '🛒',
  TripScout:        '✈️',
  ExperienceFinder: '📅',
  AdminAssist:      '🗂️',
};

interface AgentCardProps {
  agent: AgentName;
  tasks: Task[];
  tokenLog: TokenLogEntry[];
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function AgentCard({ agent, tasks, tokenLog }: AgentCardProps) {
  const today = getTodayString();

  // Today's token_log entry for this agent
  const todayEntry = tokenLog.find(
    (e) => e.agent === agent && e.date === today
  );
  const todayTokens = todayEntry?.total_tokens ?? 0;
  const todayRuns = todayEntry?.run_count ?? 0;

  // Current status: running if any task for this agent has status 'running'
  const isRunning = tasks.some(
    (t) => t.agent === agent && t.status === 'running'
  );

  return (
    <div className="rounded-xl bg-surface border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{AGENT_ICONS[agent]}</span>
          <span className={`font-semibold text-sm ${AGENT_COLORS[agent]}`}>
            {agent}
          </span>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isRunning
              ? 'bg-blue-900/50 text-blue-400 animate-pulse'
              : 'bg-slate-700 text-muted'
          }`}
        >
          {isRunning ? 'Running' : 'Idle'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-800 px-3 py-2">
          <dt className="text-muted text-xs mb-0.5">Tokens Today</dt>
          <dd className="font-mono font-semibold text-foreground">
            {todayTokens.toLocaleString()}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-800 px-3 py-2">
          <dt className="text-muted text-xs mb-0.5">Runs Today</dt>
          <dd className="font-mono font-semibold text-foreground">{todayRuns}</dd>
        </div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run build
```

---

## Task 6: TaskQueue Component

**Goal:** Tabbed view with four tabs (Pending | Running | Completed | Failed). Each row shows task title, list/agent, created time, and a status badge. Clicking a completed task opens a modal displaying the result markdown from Firestore's `results` collection.

**Files created:**
- `dashboard/src/components/TaskQueue.tsx`

- [ ] **Step 1: Write `dashboard/src/components/TaskQueue.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Task, TaskStatus } from '@/hooks/useTasks';

type Tab = 'pending' | 'running' | 'completed' | 'failed';

const TABS: { label: string; value: Tab }[] = [
  { label: 'Pending',   value: 'pending' },
  { label: 'Running',   value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed',    value: 'failed' },
];

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending:   'bg-slate-700 text-slate-300',
  running:   'bg-blue-900/60 text-blue-400',
  queued:    'bg-yellow-900/60 text-yellow-400',
  completed: 'bg-green-900/60 text-green-400',
  failed:    'bg-red-900/60 text-red-400',
};

const LIST_LABELS: Record<string, string> = {
  'price-hunt':       '🛒 Price Hunt',
  'trip-planner':     '✈️ Trip Planner',
  'experience-scout': '📅 Experience',
  'admin':            '🗂️ Admin',
};

function formatRelativeTime(seconds: number): string {
  const diff = Math.floor((Date.now() / 1000) - seconds);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface ResultModalProps {
  taskId: string;
  title: string;
  onClose: () => void;
}

function ResultModal({ taskId, title, onClose }: ResultModalProps) {
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    // Fetch result once on open
    (async () => {
      try {
        // results docs are stored with task_id as the field; query by task_id
        // For simplicity, try to get the result doc with the same ID as the task
        const ref = doc(db, 'results', taskId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setOutput((snap.data() as { output: string }).output);
        } else {
          setOutput('No result document found for this task.');
        }
      } catch (err) {
        setOutput(`Error loading result: ${err}`);
      } finally {
        setLoading(false);
      }
    })();
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm truncate pr-4">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-border rounded w-3/4" />
              <div className="h-3 bg-border rounded w-1/2" />
              <div className="h-3 bg-border rounded w-2/3" />
            </div>
          ) : (
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
              {output}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

interface TaskQueueProps {
  tasks: Task[];
}

export function TaskQueue({ tasks }: TaskQueueProps) {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const filtered = tasks.filter((t) => {
    if (activeTab === 'pending') return t.status === 'pending' || t.status === 'queued';
    return t.status === activeTab;
  });

  const tabCounts: Record<Tab, number> = {
    pending:   tasks.filter((t) => t.status === 'pending' || t.status === 'queued').length,
    running:   tasks.filter((t) => t.status === 'running').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed:    tasks.filter((t) => t.status === 'failed').length,
  };

  return (
    <>
      <div className="rounded-xl bg-surface border border-border overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.value
                  ? 'text-foreground border-b-2 border-accent bg-slate-800/50'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {tab.label}
              {tabCounts[tab.value] > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-xs">
                  {tabCounts[tab.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Task rows */}
        <div className="divide-y divide-border">
          {filtered.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">No tasks</p>
          ) : (
            filtered.map((task) => (
              <div
                key={task.id}
                className={`px-4 py-3 flex items-start justify-between gap-3 ${
                  task.status === 'completed'
                    ? 'cursor-pointer hover:bg-slate-800/50 transition-colors'
                    : ''
                }`}
                onClick={() =>
                  task.status === 'completed' ? setSelectedTask(task) : undefined
                }
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {LIST_LABELS[task.list_id] ?? task.list_id}
                    {task.agent && ` · ${task.agent}`}
                    {' · '}
                    {task.created_at
                      ? formatRelativeTime(task.created_at.seconds)
                      : ''}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[task.status]}`}
                >
                  {task.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTask && (
        <ResultModal
          taskId={selectedTask.id}
          title={selectedTask.title}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run build
```

---

## Task 7: TokenChart Component

**Goal:** A Recharts stacked bar chart showing total tokens per day for the last 7 days, with each agent as a stacked segment in a distinct color.

**Files created:**
- `dashboard/src/components/TokenChart.tsx`

- [ ] **Step 1: Write `dashboard/src/components/TokenChart.tsx`**

```typescript
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TokenLogEntry } from '@/hooks/useTokenLog';

const AGENT_COLORS = {
  PriceHunter:      '#60a5fa', // blue-400
  TripScout:        '#a78bfa', // violet-400
  ExperienceFinder: '#f472b6', // pink-400
  AdminAssist:      '#fb923c', // orange-400
};

const AGENTS = Object.keys(AGENT_COLORS) as Array<keyof typeof AGENT_COLORS>;

interface ChartRow {
  date: string;
  PriceHunter: number;
  TripScout: number;
  ExperienceFinder: number;
  AdminAssist: number;
}

function buildChartData(entries: TokenLogEntry[], days = 7): ChartRow[] {
  // Build a map of date -> agent -> tokens
  const map: Record<string, Record<string, number>> = {};

  // Pre-fill last N days with zeroes
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    map[key] = { PriceHunter: 0, TripScout: 0, ExperienceFinder: 0, AdminAssist: 0 };
  }

  // Fill in actual values
  for (const entry of entries) {
    if (map[entry.date]) {
      map[entry.date][entry.agent] = (map[entry.date][entry.agent] ?? 0) + entry.total_tokens;
    }
  }

  return Object.entries(map).map(([date, agents]) => ({
    date: date.slice(5), // MM-DD for display
    ...agents,
  })) as ChartRow[];
}

interface TokenChartProps {
  entries: TokenLogEntry[];
  loading?: boolean;
}

export function TokenChart({ entries, loading }: TokenChartProps) {
  const data = buildChartData(entries);

  return (
    <div className="rounded-xl bg-surface border border-border p-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
        Token Usage — Last 7 Days
      </h2>

      {loading ? (
        <div className="h-48 animate-pulse bg-slate-800 rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#f1f5f9' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', color: '#64748b', paddingTop: '8px' }}
            />
            {AGENTS.map((agent) => (
              <Bar
                key={agent}
                dataKey={agent}
                stackId="tokens"
                fill={AGENT_COLORS[agent]}
                radius={agent === 'AdminAssist' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run build
```

**Note:** Recharts uses browser APIs. If Next.js complains about SSR, add `'use client'` to the component (it is already included above). If the build still fails, wrap the import in `next/dynamic` with `{ ssr: false }` in `page.tsx` (covered in Task 9).

---

## Task 8: RecentResults Component

**Goal:** Show the last 5 completed tasks with title, agent name, QA verdict badge, and timestamp. Clicking a row opens the same result modal used in TaskQueue.

**Files created:**
- `dashboard/src/components/RecentResults.tsx`

- [ ] **Step 1: Write `dashboard/src/components/RecentResults.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Task, QAVerdict } from '@/hooks/useTasks';

const QA_BADGE: Record<NonNullable<QAVerdict>, string> = {
  pass:            'bg-green-900/60 text-green-400',
  pass_with_notes: 'bg-yellow-900/60 text-yellow-400',
  fail:            'bg-red-900/60 text-red-400',
};

const QA_LABEL: Record<NonNullable<QAVerdict>, string> = {
  pass:            '✅ Pass',
  pass_with_notes: '⚠️ Notes',
  fail:            '❌ Fail',
};

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ResultModalProps {
  taskId: string;
  title: string;
  onClose: () => void;
}

function ResultModal({ taskId, title, onClose }: ResultModalProps) {
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    (async () => {
      try {
        const ref = doc(db, 'results', taskId);
        const snap = await getDoc(ref);
        setOutput(snap.exists() ? (snap.data() as { output: string }).output : 'No result found.');
      } catch (err) {
        setOutput(`Error: ${err}`);
      } finally {
        setLoading(false);
      }
    })();
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm truncate pr-4">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg" aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-border rounded w-3/4" />
              <div className="h-3 bg-border rounded w-1/2" />
            </div>
          ) : (
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
              {output}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

interface RecentResultsProps {
  tasks: Task[];
}

export function RecentResults({ tasks }: RecentResultsProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const completed = tasks
    .filter((t) => t.status === 'completed' && t.completed_at)
    .sort((a, b) => (b.completed_at?.seconds ?? 0) - (a.completed_at?.seconds ?? 0))
    .slice(0, 5);

  return (
    <>
      <div className="rounded-xl bg-surface border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Recent Results
          </h2>
        </div>

        <div className="divide-y divide-border">
          {completed.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">No completed tasks yet</p>
          ) : (
            completed.map((task) => (
              <div
                key={task.id}
                className="px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => setSelectedTask(task)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {task.agent ?? 'Unknown agent'}
                      {task.completed_at && ` · ${formatTime(task.completed_at.seconds)}`}
                    </p>
                  </div>
                  {task.qa_verdict && (
                    <span
                      className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${QA_BADGE[task.qa_verdict]}`}
                    >
                      {QA_LABEL[task.qa_verdict]}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTask && (
        <ResultModal
          taskId={selectedTask.id}
          title={selectedTask.title}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run build
```

---

## Task 9: Assemble Main Page

**Goal:** Wire all components into `app/layout.tsx` and `app/page.tsx` with a responsive, mobile-first layout. The header bar (title + heartbeat badge) sits at the top. Below it, sections stack vertically on mobile and reflow on wider screens.

**Files modified/created:**
- `dashboard/src/app/layout.tsx`
- `dashboard/src/app/page.tsx`

- [ ] **Step 1: Write `dashboard/src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Admin Workflow',
  description: 'Real-time agent dashboard',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Write `dashboard/src/app/page.tsx`**

```typescript
'use client';

import dynamic from 'next/dynamic';
import { useTasks } from '@/hooks/useTasks';
import { useTokenLog } from '@/hooks/useTokenLog';
import { useConfig } from '@/hooks/useConfig';
import { HeartbeatPanel } from '@/components/HeartbeatPanel';
import { AgentCard, AGENTS } from '@/components/AgentCard';
import { TaskQueue } from '@/components/TaskQueue';
import { RecentResults } from '@/components/RecentResults';

// Recharts must be client-side only (no SSR)
const TokenChart = dynamic(
  () => import('@/components/TokenChart').then((m) => m.TokenChart),
  { ssr: false }
);

export default function DashboardPage() {
  const { tasks, loading: tasksLoading } = useTasks();
  const { entries: tokenLog, loading: tokenLoading } = useTokenLog(7);
  const { config } = useConfig();

  const paused = config?.heartbeat_paused ?? false;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-base tracking-tight">Admin Workflow</h1>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            paused
              ? 'bg-yellow-900/50 text-yellow-400'
              : 'bg-green-900/50 text-green-400'
          }`}
        >
          <span className="text-base leading-none">{paused ? '⏸' : '🟢'}</span>
          {paused ? 'Paused' : 'Active'}
        </span>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* Heartbeat Panel */}
        <HeartbeatPanel />

        {/* Agent Status Cards — 2 columns on mobile, 4 on wide screens */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Agent Status
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {AGENTS.map((agent) => (
              <AgentCard
                key={agent}
                agent={agent}
                tasks={tasksLoading ? [] : tasks}
                tokenLog={tokenLog}
              />
            ))}
          </div>
        </section>

        {/* Task Queue */}
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Task Queue
          </h2>
          <TaskQueue tasks={tasksLoading ? [] : tasks} />
        </section>

        {/* Token Usage Chart */}
        <TokenChart entries={tokenLog} loading={tokenLoading} />

        {/* Recent Results */}
        <RecentResults tasks={tasksLoading ? [] : tasks} />

      </main>
    </div>
  );
}
```

- [ ] **Step 3: Final build verification**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run build
npm run lint
```

Expected: zero TypeScript errors, zero lint errors, no SSR warnings.

- [ ] **Step 4: Visual confirmation (dev server)**

```bash
cd "Claude Coding Projects/admin-workflow/dashboard"
npm run dev
```

Open `http://localhost:3000` on your desktop and on your phone (same network). Confirm:
1. Header bar shows "Admin Workflow" + heartbeat badge (color matches Firestore `heartbeat_paused` value)
2. HeartbeatPanel shows last run time and next run time
3. All four AgentCards render (Idle if no running tasks)
4. TaskQueue tabs are tappable; Pending tab shows tasks if any exist in Firestore
5. TokenChart renders (may be all zeros if no token_log data yet — that is correct)
6. RecentResults shows "No completed tasks yet" if queue is empty
7. Tapping a completed task opens the result modal with markdown content
8. Layout is readable on a 390px-wide phone screen (no horizontal scroll)

---

## Task 10: Vercel Deployment Config + README

**Goal:** Configure Vercel to deploy the `dashboard/` subfolder and document all setup steps so the dashboard can be redeployed from any machine.

**Files created:**
- `dashboard/README.md`
- `dashboard/vercel.json`

- [ ] **Step 1: Write `dashboard/vercel.json`**

This file is not strictly required when using Vercel's "root directory" setting, but it makes the config explicit and portable:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install"
}
```

- [ ] **Step 2: Write `dashboard/README.md`**

```markdown
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
```

- [ ] **Step 3: Verify `dashboard/` is not double-listed in the root `.gitignore`**

The root `admin-workflow/.gitignore` should ignore `dashboard/node_modules/` and `dashboard/.env.local` (or Next.js's default `.gitignore` inside `dashboard/` handles these). Confirm:

```bash
cat "Claude Coding Projects/admin-workflow/.gitignore"
```

If `dashboard/` itself is listed as ignored, remove that line — we want the dashboard source committed.

- [ ] **Step 4: Commit everything**

```bash
cd "Claude Coding Projects/admin-workflow"
git add dashboard/
git commit -m "feat: add Next.js dashboard for real-time agent visibility"
```

- [ ] **Step 5: Deploy to Vercel**

1. Go to https://vercel.com/new
2. Import the GitHub repo (`admin-workflow`)
3. Set **Root Directory** → `dashboard`
4. Add environment variables: paste all `NEXT_PUBLIC_FIREBASE_*` values from your `.env.local`
5. Click **Deploy**
6. After deploy completes, open the Vercel URL on your phone and confirm all sections load with live data

- [ ] **Step 6: Verify production build on Vercel**

In the Vercel deployment log, confirm:
- Build succeeded with `next build`
- No environment variable warnings (all `NEXT_PUBLIC_FIREBASE_*` resolved)
- The deployment URL is accessible and loads the dashboard within 2 seconds on a mobile connection
