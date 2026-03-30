# Admin Workflow — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the project skeleton, webhook server, Firestore schema, and launchd daemon so every other sub-project has a working foundation to build on.

**Architecture:** A Node.js HTTP server listens on `localhost:3001` and receives POST requests from Apple Shortcuts. It validates a shared secret, writes a task document to Firestore, and returns 200 immediately. A macOS `launchd` plist keeps the server alive across reboots. Firebase is initialized with the full schema (collections: `tasks`, `results`, `memory`, `cache`, `token_log`, `config`).

**Tech Stack:** Node.js 20+, TypeScript, Firebase Admin SDK, dotenv, Jest, macOS launchd

---

## Sub-Project Roadmap

This is Plan 1 of 5. Plans must be executed in order (each depends on the foundation):
- **Plan 1: Foundation** ← you are here
- **Plan 2: Agent System** — efficiency layer, memory, 4 research agents, QA agent
- **Plan 3: Orchestration** — heartbeat processor, Discord delivery, feedback loop, morning summary
- **Plan 4: Dashboard** — Next.js + Vercel frontend, real-time Firestore
- **Plan 5: Apple Shortcuts** — macOS Shortcut configuration guide for 4 reminder lists

---

## File Structure

```
admin-workflow/
├── src/
│   ├── server/
│   │   ├── index.ts          # HTTP server entrypoint (starts server, handles graceful shutdown)
│   │   ├── webhook.ts        # POST /trigger handler (validates secret, writes to Firestore)
│   │   └── middleware.ts     # Auth middleware (validates Bearer token)
│   ├── db/
│   │   ├── firebase.ts       # Firebase Admin SDK init (singleton)
│   │   ├── tasks.ts          # Task CRUD operations
│   │   └── schema.ts         # TypeScript types for all Firestore documents
│   └── config.ts             # Env var loading and validation
├── tests/
│   ├── server/
│   │   ├── webhook.test.ts   # Webhook handler unit tests
│   │   └── middleware.test.ts # Auth middleware unit tests
│   └── db/
│       └── tasks.test.ts     # Task CRUD unit tests (mocked Firestore)
├── scripts/
│   └── init-firestore.ts     # One-time script to create Firestore collections + config doc
├── launchd/
│   └── com.adminworkflow.server.plist  # macOS launchd plist
├── .env.example              # Required env vars template
├── package.json
├── tsconfig.json
└── jest.config.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialize npm project**

```bash
cd "Claude Coding Projects/admin-workflow"
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install firebase-admin express dotenv
npm install --save-dev typescript ts-node @types/node @types/express jest ts-jest @types/jest supertest @types/supertest
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Write jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts'],
};

export default config;
```

- [ ] **Step 5: Write .env.example**

```
# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id

# Webhook Server
PORT=3001
WEBHOOK_SECRET=change-this-to-a-random-secret-min-32-chars

# Discord
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_CHANNEL_ID=your-channel-id

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key
```

- [ ] **Step 6: Write .gitignore**

```
node_modules/
dist/
.env
results/
*.log
```

- [ ] **Step 7: Add scripts to package.json**

Edit `package.json` to add:
```json
{
  "scripts": {
    "start": "node dist/server/index.js",
    "dev": "ts-node src/server/index.ts",
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "init-db": "ts-node scripts/init-firestore.ts"
  }
}
```

- [ ] **Step 8: Create directory structure**

```bash
mkdir -p src/server src/db scripts tests/server tests/db launchd
```

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "chore: initialize project scaffold"
```

---

## Task 2: TypeScript Schema (Firestore Types)

**Files:**
- Create: `src/db/schema.ts`

- [ ] **Step 1: Write failing test**

Create `tests/db/schema.test.ts`:
```typescript
import { TaskStatus, QAVerdict, Task, Result, AgentMemory, CacheEntry, TokenLog } from '@/db/schema';

describe('schema types', () => {
  it('TaskStatus enum contains all valid statuses', () => {
    expect(TaskStatus.PENDING).toBe('pending');
    expect(TaskStatus.RUNNING).toBe('running');
    expect(TaskStatus.QUEUED).toBe('queued');
    expect(TaskStatus.COMPLETED).toBe('completed');
    expect(TaskStatus.FAILED).toBe('failed');
  });

  it('QAVerdict enum contains all valid verdicts', () => {
    expect(QAVerdict.PASS).toBe('pass');
    expect(QAVerdict.PASS_WITH_NOTES).toBe('pass_with_notes');
    expect(QAVerdict.FAIL).toBe('fail');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/db/schema.test.ts
```
Expected: FAIL with "Cannot find module '@/db/schema'"

- [ ] **Step 3: Write schema.ts**

```typescript
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  QUEUED = 'queued',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum QAVerdict {
  PASS = 'pass',
  PASS_WITH_NOTES = 'pass_with_notes',
  FAIL = 'fail',
}

export type ListId = 'price-hunt' | 'trip-planner' | 'experience-scout' | 'admin';

export interface Task {
  id: string;
  title: string;
  list_id: ListId;
  status: TaskStatus;
  agent: string | null;
  created_at: FirebaseFirestore.Timestamp;
  started_at: FirebaseFirestore.Timestamp | null;
  completed_at: FirebaseFirestore.Timestamp | null;
  tokens_used: number;
  qa_verdict: QAVerdict | null;
  result_path: string | null;
  retry_count: number;
  heartbeat_lock: FirebaseFirestore.Timestamp | null;
  discord_message_id: string | null;
}

export interface Result {
  task_id: string;
  agent: string;
  output: string;
  sources: Array<{ url: string; title: string; retrieved_at: FirebaseFirestore.Timestamp }>;
  qa_notes: string | null;
  created_at: FirebaseFirestore.Timestamp;
}

export interface AgentMemory {
  successful_sources: string[];
  blocked_sources: string[];
  user_preferences: Record<string, unknown>;
  last_updated: FirebaseFirestore.Timestamp;
}

export interface CacheEntry {
  cache_key: string;
  task_id: string;
  result_path: string;
  created_at: FirebaseFirestore.Timestamp;
}

export interface TokenLog {
  date: string; // YYYY-MM-DD
  agent: string;
  total_tokens: number;
  run_count: number;
}

export interface SystemConfig {
  heartbeat_paused: boolean;
  morning_summary_cron: string; // cron expression, default '0 7 * * *'
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/db/schema.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts tests/db/schema.test.ts
git commit -m "feat: add Firestore document schema types"
```

---

## Task 3: Config Loader

**Files:**
- Create: `src/config.ts`
- Create: `tests/server/config.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/server/config.test.ts`:
```typescript
describe('config validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws if WEBHOOK_SECRET is missing', () => {
    delete process.env.WEBHOOK_SECRET;
    expect(() => require('@/config')).toThrow('WEBHOOK_SECRET');
  });

  it('throws if FIREBASE_PROJECT_ID is missing', () => {
    process.env.WEBHOOK_SECRET = 'test-secret-that-is-long-enough-to-pass';
    delete process.env.FIREBASE_PROJECT_ID;
    expect(() => require('@/config')).toThrow('FIREBASE_PROJECT_ID');
  });

  it('returns config when all required vars are set', () => {
    process.env.WEBHOOK_SECRET = 'test-secret-that-is-long-enough-to-pass';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----\n';
    process.env.PORT = '3001';
    const config = require('@/config').default;
    expect(config.webhookSecret).toBe('test-secret-that-is-long-enough-to-pass');
    expect(config.port).toBe(3001);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/server/config.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write config.ts**

```typescript
import dotenv from 'dotenv';
dotenv.config();

function require_env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  webhookSecret: require_env('WEBHOOK_SECRET'),
  firebase: {
    projectId: require_env('FIREBASE_PROJECT_ID'),
    clientEmail: require_env('FIREBASE_CLIENT_EMAIL'),
    privateKey: require_env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  },
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN ?? '',
    channelId: process.env.DISCORD_CHANNEL_ID ?? '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  },
  resultsDir: process.env.RESULTS_DIR ?? `${process.env.HOME}/admin-workflow/results`,
};

export default config;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/server/config.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/server/config.test.ts
git commit -m "feat: add config loader with env validation"
```

---

## Task 4: Firebase Singleton

**Files:**
- Create: `src/db/firebase.ts`

- [ ] **Step 1: Write firebase.ts**

```typescript
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
```

*Note: Firebase Admin SDK initializes lazily — no test needed for the singleton itself, it is covered by integration tests in later plans.*

- [ ] **Step 2: Commit**

```bash
git add src/db/firebase.ts
git commit -m "feat: add Firebase Admin singleton"
```

---

## Task 5: Task CRUD

**Files:**
- Create: `src/db/tasks.ts`
- Create: `tests/db/tasks.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/db/tasks.test.ts`:
```typescript
import { createTask, getTask, updateTaskStatus } from '@/db/tasks';
import { TaskStatus, ListId } from '@/db/schema';

// Mock Firestore
const mockDoc = {
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
};
const mockCollection = { doc: jest.fn(() => mockDoc), add: jest.fn() };

jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => mockCollection),
    runTransaction: jest.fn(async (fn: Function) => fn({ get: mockDoc.get, update: mockDoc.update, set: mockDoc.set })),
  })),
}));

describe('createTask', () => {
  it('writes a task document with status pending', async () => {
    mockCollection.add = jest.fn().mockResolvedValue({ id: 'task-123' });
    const id = await createTask('Best headphones under $200', 'price-hunt' as ListId);
    expect(id).toBe('task-123');
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Best headphones under $200',
        list_id: 'price-hunt',
        status: TaskStatus.PENDING,
        tokens_used: 0,
        retry_count: 0,
        agent: null,
        heartbeat_lock: null,
        discord_message_id: null,
      })
    );
  });
});

describe('updateTaskStatus', () => {
  it('updates status field on the task document', async () => {
    await updateTaskStatus('task-123', TaskStatus.RUNNING);
    expect(mockDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: TaskStatus.RUNNING })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/db/tasks.test.ts
```
Expected: FAIL with "Cannot find module '@/db/tasks'"

- [ ] **Step 3: Write tasks.ts**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/db/tasks.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/tasks.ts tests/db/tasks.test.ts
git commit -m "feat: add task CRUD operations"
```

---

## Task 6: Auth Middleware

**Files:**
- Create: `src/server/middleware.ts`
- Create: `tests/server/middleware.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/server/middleware.test.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '@/server/middleware';

// Set secret before requiring module
process.env.WEBHOOK_SECRET = 'test-secret-that-is-long-enough-ok';
process.env.FIREBASE_PROJECT_ID = 'test';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';

const mockRes = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('authMiddleware', () => {
  it('calls next() with valid Bearer token', () => {
    const req = { headers: { authorization: 'Bearer test-secret-that-is-long-enough-ok' } } as Request;
    const next = jest.fn() as NextFunction;
    authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 with missing Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    authMiddleware(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 with wrong secret', () => {
    const req = { headers: { authorization: 'Bearer wrong-secret' } } as Request;
    const res = mockRes();
    authMiddleware(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/server/middleware.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write middleware.ts**

```typescript
import { Request, Response, NextFunction } from 'express';
import config from '@/config';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  const token = auth.slice(7);
  if (token !== config.webhookSecret) {
    res.status(401).json({ error: 'Invalid secret' });
    return;
  }
  next();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/server/middleware.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/middleware.ts tests/server/middleware.test.ts
git commit -m "feat: add webhook auth middleware"
```

---

## Task 7: Webhook Handler

**Files:**
- Create: `src/server/webhook.ts`
- Create: `tests/server/webhook.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/server/webhook.test.ts`:
```typescript
import request from 'supertest';
import express from 'express';
import { webhookRouter } from '@/server/webhook';

jest.mock('@/db/tasks', () => ({ createTask: jest.fn().mockResolvedValue('task-abc') }));
jest.mock('@/db/firebase', () => ({ getFirestore: jest.fn() }));

const app = express();
app.use(express.json());
app.use('/trigger', webhookRouter);

const VALID_SECRET = 'test-secret-that-is-long-enough-ok';
process.env.WEBHOOK_SECRET = VALID_SECRET;
process.env.FIREBASE_PROJECT_ID = 'test';
process.env.FIREBASE_CLIENT_EMAIL = 'x@x.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = 'key';

describe('POST /trigger', () => {
  it('returns 200 with task_id for valid payload', async () => {
    const res = await request(app)
      .post('/trigger')
      .set('Authorization', `Bearer ${VALID_SECRET}`)
      .send({ title: 'Best headphones', list_id: 'price-hunt', timestamp: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.task_id).toBe('task-abc');
  });

  it('returns 401 for missing auth', async () => {
    const res = await request(app)
      .post('/trigger')
      .send({ title: 'Best headphones', list_id: 'price-hunt', timestamp: new Date().toISOString() });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing title', async () => {
    const res = await request(app)
      .post('/trigger')
      .set('Authorization', `Bearer ${VALID_SECRET}`)
      .send({ list_id: 'price-hunt', timestamp: new Date().toISOString() });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid list_id', async () => {
    const res = await request(app)
      .post('/trigger')
      .set('Authorization', `Bearer ${VALID_SECRET}`)
      .send({ title: 'Something', list_id: 'unknown-list', timestamp: new Date().toISOString() });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/server/webhook.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write webhook.ts**

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware } from '@/server/middleware';
import { createTask } from '@/db/tasks';
import { ListId } from '@/db/schema';

const VALID_LIST_IDS: ListId[] = ['price-hunt', 'trip-planner', 'experience-scout', 'admin'];

export const webhookRouter = Router();

webhookRouter.use(authMiddleware);

webhookRouter.post('/', async (req: Request, res: Response) => {
  const { title, list_id, timestamp } = req.body;

  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'Missing or invalid title' });
    return;
  }
  if (!VALID_LIST_IDS.includes(list_id)) {
    res.status(400).json({ error: `Invalid list_id. Must be one of: ${VALID_LIST_IDS.join(', ')}` });
    return;
  }

  const task_id = await createTask(title.trim(), list_id as ListId);
  res.status(200).json({ task_id, status: 'queued' });
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/server/webhook.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/webhook.ts tests/server/webhook.test.ts
git commit -m "feat: add POST /trigger webhook handler"
```

---

## Task 8: HTTP Server Entrypoint

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
import express from 'express';
import { webhookRouter } from '@/server/webhook';
import config from '@/config';

const app = express();
app.use(express.json());
app.use('/trigger', webhookRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = app.listen(config.port, () => {
  console.log(`Admin workflow server running on port ${config.port}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});

export { app };
```

- [ ] **Step 2: Build and verify it compiles**

```bash
npm run build
```
Expected: no errors, `dist/` directory created

- [ ] **Step 3: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: add HTTP server entrypoint"
```

---

## Task 9: Firestore Initialization Script

**Files:**
- Create: `scripts/init-firestore.ts`

This is a one-time setup script. Run once to create the required collections and system config document.

- [ ] **Step 1: Write init-firestore.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/init-firestore.ts
git commit -m "feat: add Firestore initialization script"
```

---

## Task 10: launchd Plist (Always-On Daemon)

**Files:**
- Create: `launchd/com.adminworkflow.server.plist`
- Create: `launchd/README.md`

- [ ] **Step 1: Write the plist**

Replace `YOUR_USERNAME` with your actual macOS username (run `whoami` to find it):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.adminworkflow.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOUR_USERNAME/Claude Coding Projects/admin-workflow/dist/server/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USERNAME/Claude Coding Projects/admin-workflow</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/YOUR_USERNAME/Claude Coding Projects/admin-workflow/server.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR_USERNAME/Claude Coding Projects/admin-workflow/server-error.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Write launchd/README.md**

```markdown
# launchd Setup

This keeps the webhook server running at all times, surviving reboots and sleep/wake.

## Install

1. Build the project first:
   ```bash
   npm run build
   ```

2. Edit the plist — replace `YOUR_USERNAME` with your macOS username:
   ```bash
   whoami  # get your username
   ```

3. Copy the plist to the LaunchAgents directory:
   ```bash
   cp launchd/com.adminworkflow.server.plist ~/Library/LaunchAgents/
   ```

4. Make sure your `.env` file exists in the project root — the server reads it at startup using `dotenv`. The launchd daemon will start silently and fail if `.env` is missing.

5. Load it:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.adminworkflow.server.plist
   ```

5. Verify it's running:
   ```bash
   curl http://localhost:3001/health
   # Expected: {"status":"ok"}
   ```

## Control

```bash
# Stop the server
launchctl unload ~/Library/LaunchAgents/com.adminworkflow.server.plist

# Restart
launchctl unload ~/Library/LaunchAgents/com.adminworkflow.server.plist
launchctl load ~/Library/LaunchAgents/com.adminworkflow.server.plist

# View logs
tail -f "Claude Coding Projects/admin-workflow/server.log"
```
```

- [ ] **Step 3: Commit**

```bash
git add launchd/
git commit -m "feat: add launchd plist for always-on server daemon"
```

---

## Task 11: Full Test Suite + Final Verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: All tests PASS, no failures

- [ ] **Step 2: Run test coverage**

```bash
npm run test:coverage
```
Expected: Coverage report generated. Core modules (webhook.ts, middleware.ts, tasks.ts) should be ≥ 80% covered.

- [ ] **Step 3: Final build**

```bash
npm run build
```
Expected: Compiles without errors.

- [ ] **Step 4: Smoke test the server locally**

```bash
# Terminal 1: start the server
npm run dev

# Terminal 2: health check
curl http://localhost:3001/health
# Expected: {"status":"ok"}

# Terminal 3: test webhook (replace YOUR_SECRET with value from .env)
curl -X POST http://localhost:3001/trigger \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{"title":"Test task","list_id":"price-hunt","timestamp":"2026-03-29T00:00:00Z"}'
# Expected: {"task_id":"...","status":"queued"}
```

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete Plan 1 foundation — webhook server ready"
```

---

## Setup Checklist (Do Before Running Code)

- [ ] Copy `.env.example` to `.env` and fill in all values
  - Firebase: create a service account in Firebase Console → Project Settings → Service Accounts → Generate new private key
  - `WEBHOOK_SECRET`: generate a random 32+ character string (`openssl rand -base64 32`)
- [ ] Run `npm run init-db` to initialize Firestore collections
- [ ] Run `npm run build`
- [ ] Copy and configure the launchd plist (see `launchd/README.md`)
- [ ] Verify server is running: `curl http://localhost:3001/health`

**Ready for Plan 2 (Agent System) once the health check passes.**
