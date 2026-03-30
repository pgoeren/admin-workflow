# Admin Workflow — Plan 3: Orchestration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the orchestration layer — token logging, heartbeat task processor, Discord message formatting and feedback handling, morning summary, and command parsing — so the system runs autonomously via cron and communicates results through Discord.

**Architecture:** A heartbeat processor claims and runs one task at a time using a Firestore transaction lock (prevents double-processing). Results are formatted as Discord messages by pure formatter functions. A morning summary queries the last 24 hours and outputs a status table. All Discord posting happens via the Claude Code MCP plugin (`mcp__plugin_discord_discord__reply`), not from Node.js directly — the CLI scripts output formatted strings to stdout for the cron to consume and post. Token usage is incremented atomically via Firestore `FieldValue.increment()` keyed by date+agent.

**Tech Stack:** firebase-admin (Firestore transactions + increment), @anthropic-ai/sdk (Haiku for feedback parsing), Node.js ts-node, Jest mocks

**Depends on:** Plan 1 (Foundation) and Plan 2 (Agent System) complete — `runAgent()`, `updateTaskStatus()`, `getFirestore()`, `saveResult()`, all available.

---

## File Structure

```
src/
├── token-log/
│   └── index.ts              # incrementTokenLog() — atomic Firestore increment
├── discord/
│   ├── delivery.ts           # formatResultMessage() — pure Discord message formatter
│   ├── feedback.ts           # processReaction(), processReply() — user feedback handlers
│   ├── morning-summary.ts    # generateMorningSummary() — daily status digest
│   └── commands.ts           # handleCommand() — text command parser + Firestore writer
├── heartbeat/
│   └── index.ts              # claimNextTask(), processHeartbeat(), releaseHeartbeatLock()
├── agents/
│   └── runner.ts             # MODIFY: call incrementTokenLog after task completion
scripts/
├── run-heartbeat.ts          # CLI: calls processHeartbeat(), prints JSON to stdout
└── run-morning-summary.ts    # CLI: calls generateMorningSummary(), prints string to stdout
tests/
├── token-log/
│   └── index.test.ts
├── discord/
│   ├── delivery.test.ts
│   ├── feedback.test.ts
│   ├── morning-summary.test.ts
│   └── commands.test.ts
└── heartbeat/
    └── index.test.ts
```

---

## Task 1: Token Log

**Files:**
- Create: `src/token-log/index.ts`
- Create: `tests/token-log/index.test.ts`

### What it does

`incrementTokenLog(agent, tokensUsed)` writes to the `token_log` Firestore collection. Documents are keyed `YYYY-MM-DD_agentname`. On each call it atomically increments `total_tokens` and `run_count` using `FieldValue.increment()`. If the document doesn't exist, `set({ merge: true })` creates it with the date and agent fields.

- [ ] **Step 1: Write the failing test**

Create `tests/token-log/index.test.ts`:

```typescript
import { incrementTokenLog } from '@/token-log/index';

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn(() => ({ set: mockSet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({ collection: mockCollection })),
}));

// Pin date so document key is deterministic
const FIXED_DATE = '2026-03-30';
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(`${FIXED_DATE}T09:00:00Z`));
});
afterAll(() => jest.useRealTimers());

describe('incrementTokenLog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls set with merge:true on the correct document key', async () => {
    await incrementTokenLog('price-hunter', 1500);

    expect(mockCollection).toHaveBeenCalledWith('token_log');
    expect(mockDoc).toHaveBeenCalledWith(`${FIXED_DATE}_price-hunter`);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        date: FIXED_DATE,
        agent: 'price-hunter',
      }),
      { merge: true }
    );
  });

  it('passes FieldValue.increment for total_tokens and run_count', async () => {
    await incrementTokenLog('trip-scout', 800);
    const callArg = mockSet.mock.calls[0][0];
    // FieldValue objects are opaque; check they are not plain numbers
    expect(typeof callArg.total_tokens).not.toBe('number');
    expect(typeof callArg.run_count).not.toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/token-log/index.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/token-log/index'`

- [ ] **Step 3: Create directory and implement**

```bash
mkdir -p "/Users/petergoeren/Claude Coding Projects/admin-workflow/src/token-log"
```

Create `src/token-log/index.ts`:

```typescript
import * as admin from 'firebase-admin';
import { getFirestore } from '@/db/firebase';

const TOKEN_LOG_COLLECTION = 'token_log';

export async function incrementTokenLog(agent: string, tokensUsed: number): Promise<void> {
  const db = getFirestore();
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/token-log/index.test.ts --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add src/token-log/index.ts tests/token-log/index.test.ts
git commit -m "feat: add token log with atomic Firestore increment"
```

---

## Task 2: Integrate Token Logging into runner.ts

**Files:**
- Modify: `src/agents/runner.ts`
- Modify: `tests/agents/runner.test.ts`

### What it does

After a successful task completion (and also after a QA-failed save), call `incrementTokenLog(agentName, agentResult.tokensUsed)`. This should be fire-and-forget — if token logging fails it must not crash the pipeline. Use `Promise.all` or a separate non-blocking call after the existing awaits.

- [ ] **Step 1: Write the failing test**

Open `tests/agents/runner.test.ts` and add a mock + assertion for `incrementTokenLog`. Add this mock near the top with the other mocks:

```typescript
jest.mock('@/token-log/index', () => ({
  incrementTokenLog: jest.fn().mockResolvedValue(undefined),
}));
```

Then add a new test inside `describe('runAgent')`:

```typescript
it('calls incrementTokenLog with agent name and tokens used', async () => {
  const { incrementTokenLog } = require('@/token-log/index');
  await runAgent({ taskId: 'task-abc', title: 'Best headphones under $200', listId: 'price-hunt' });
  expect(incrementTokenLog).toHaveBeenCalledWith('price-hunter', 1500);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/agents/runner.test.ts --no-coverage
```

Expected: FAIL — `incrementTokenLog` not called

- [ ] **Step 3: Add import and call in runner.ts**

Add import at top of `src/agents/runner.ts`:

```typescript
import { incrementTokenLog } from '@/token-log/index';
```

In the success path (after `setCachedResult`), add:

```typescript
await incrementTokenLog(agentName, agentResult!.tokensUsed);
```

In the QA-failed path (after `updateTaskStatus(taskId, TaskStatus.FAILED, ...)`), add:

```typescript
await incrementTokenLog(agentName, agentResult!.tokensUsed);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/agents/runner.test.ts --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add src/agents/runner.ts tests/agents/runner.test.ts
git commit -m "feat: call incrementTokenLog after each agent run"
```

---

## Task 3: Discord Delivery Formatter

**Files:**
- Create: `src/discord/delivery.ts`
- Create: `tests/discord/delivery.test.ts`

### What it does

`formatResultMessage(params)` is a pure function (no Firestore, no network). It takes:
- `title: string` — task title
- `agentName: string` — e.g. `'price-hunter'`
- `qaVerdict: QAVerdict` — from schema enum
- `output: string` — full markdown output
- `sources: Array<{ url: string; title: string }>` — source links

It returns a Discord-ready string. Format:

```
**[title]** — price-hunter | QA: pass

[output, truncated if needed]

Sources:
• [source title](url)
• [source title](url)
```

Total length must be ≤ 2000 characters. If the combined message would exceed 2000 chars, truncate the output section and append `…[truncated]` before the Sources block. Sources section is always appended in full after truncation (if it fits; if sources alone exceed 2000 chars, include as many as fit).

- [ ] **Step 1: Write the failing test**

```bash
mkdir -p "/Users/petergoeren/Claude Coding Projects/admin-workflow/src/discord"
mkdir -p "/Users/petergoeren/Claude Coding Projects/admin-workflow/tests/discord"
```

Create `tests/discord/delivery.test.ts`:

```typescript
import { formatResultMessage } from '@/discord/delivery';
import { QAVerdict } from '@/db/schema';

const BASE_PARAMS = {
  title: 'Best headphones under $200',
  agentName: 'price-hunter',
  qaVerdict: QAVerdict.PASS,
  output: '## Results\nSony WH-1000XM5: $179\nBose QC45: $199',
  sources: [
    { url: 'https://amazon.com/dp/B09', title: 'Amazon - Sony WH-1000XM5' },
    { url: 'https://rtings.com/headphones', title: 'RTINGS Review' },
  ],
};

describe('formatResultMessage', () => {
  it('includes task title in the header', () => {
    const msg = formatResultMessage(BASE_PARAMS);
    expect(msg).toContain('Best headphones under $200');
  });

  it('includes agent name and QA verdict', () => {
    const msg = formatResultMessage(BASE_PARAMS);
    expect(msg).toContain('price-hunter');
    expect(msg).toContain('pass');
  });

  it('includes source links formatted as markdown', () => {
    const msg = formatResultMessage(BASE_PARAMS);
    expect(msg).toContain('https://amazon.com/dp/B09');
    expect(msg).toContain('Amazon - Sony WH-1000XM5');
  });

  it('stays within 2000 characters', () => {
    const msg = formatResultMessage(BASE_PARAMS);
    expect(msg.length).toBeLessThanOrEqual(2000);
  });

  it('truncates long output to stay within 2000 chars', () => {
    const longOutput = 'x'.repeat(2000);
    const msg = formatResultMessage({ ...BASE_PARAMS, output: longOutput });
    expect(msg.length).toBeLessThanOrEqual(2000);
    expect(msg).toContain('truncated');
  });

  it('handles empty sources gracefully', () => {
    const msg = formatResultMessage({ ...BASE_PARAMS, sources: [] });
    expect(msg.length).toBeLessThanOrEqual(2000);
    expect(typeof msg).toBe('string');
  });

  it('shows QA_PASS_WITH_NOTES verdict label', () => {
    const msg = formatResultMessage({ ...BASE_PARAMS, qaVerdict: QAVerdict.PASS_WITH_NOTES });
    expect(msg).toContain('pass_with_notes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/discord/delivery.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/discord/delivery'`

- [ ] **Step 3: Implement**

Create `src/discord/delivery.ts`:

```typescript
import { QAVerdict } from '@/db/schema';

interface FormatResultParams {
  title: string;
  agentName: string;
  qaVerdict: QAVerdict;
  output: string;
  sources: Array<{ url: string; title: string }>;
}

const MAX_LENGTH = 2000;

export function formatResultMessage(params: FormatResultParams): string {
  const { title, agentName, qaVerdict, output, sources } = params;

  const header = `**${title}** — ${agentName} | QA: ${qaVerdict}\n\n`;

  const sourcesSection =
    sources.length > 0
      ? `\n\nSources:\n${sources.map(s => `• [${s.title}](${s.url})`).join('\n')}`
      : '';

  const available = MAX_LENGTH - header.length - sourcesSection.length;

  let body: string;
  if (output.length <= available) {
    body = output;
  } else {
    const truncMarker = '…[truncated]';
    body = output.slice(0, available - truncMarker.length) + truncMarker;
  }

  const full = header + body + sourcesSection;

  // Safety net: if sources section alone pushes past limit, trim sources
  if (full.length <= MAX_LENGTH) return full;

  // Trim sources one by one until it fits
  let trimmedSources = [...sources];
  while (trimmedSources.length > 0) {
    trimmedSources = trimmedSources.slice(0, -1);
    const trimmedSourcesSection =
      trimmedSources.length > 0
        ? `\n\nSources:\n${trimmedSources.map(s => `• [${s.title}](${s.url})`).join('\n')}`
        : '';
    const candidate = header + body + trimmedSourcesSection;
    if (candidate.length <= MAX_LENGTH) return candidate;
  }

  // Last resort: just header + body truncated to limit
  return (header + body).slice(0, MAX_LENGTH);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/discord/delivery.test.ts --no-coverage
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add src/discord/delivery.ts tests/discord/delivery.test.ts
git commit -m "feat: add Discord delivery formatter with 2000-char truncation"
```

---

## Task 4: Heartbeat Processor

**Files:**
- Create: `src/heartbeat/index.ts`
- Create: `tests/heartbeat/index.test.ts`

### What it does

Three exports:

1. **`claimNextTask()`** — Firestore transaction:
   - Query `tasks` collection where `status in ['pending', 'queued']`, order by `status` (queued first, then pending), then `created_at` ascending.
   - For each candidate in order: check `heartbeat_lock === null` OR `(now - heartbeat_lock.toDate()) > 60 minutes`.
   - The first claimable task gets `heartbeat_lock` set to `FieldValue.serverTimestamp()` atomically inside a transaction.
   - Returns the `Task` document or `null` if nothing claimable.

2. **`processHeartbeat()`** — full run:
   - Read `config/system` document; if `heartbeat_paused === true`, return `null`.
   - Call `claimNextTask()`. If null, return null.
   - Call `runAgent({ taskId, title, listId })`.
   - Fetch the updated task from Firestore to get `qa_verdict`, `agent`, `result_path`.
   - Fetch the result document to get `output` and `sources`.
   - Build a Discord message via `formatResultMessage()`.
   - Return `{ taskId, title, discordMessage }`.

3. **`releaseHeartbeatLock(taskId)`** — sets `heartbeat_lock: null` on the task. For crash recovery.

- [ ] **Step 1: Write the failing test**

```bash
mkdir -p "/Users/petergoeren/Claude Coding Projects/admin-workflow/src/heartbeat"
mkdir -p "/Users/petergoeren/Claude Coding Projects/admin-workflow/tests/heartbeat"
```

Create `tests/heartbeat/index.test.ts`:

```typescript
import { claimNextTask, processHeartbeat, releaseHeartbeatLock } from '@/heartbeat/index';
import { TaskStatus, QAVerdict } from '@/db/schema';
import * as admin from 'firebase-admin';

// --- Firestore mock setup ---
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockTaskDocRef = { update: mockUpdate };

const pendingTaskData = {
  id: 'task-001',
  title: 'Find best coffee maker',
  list_id: 'price-hunt',
  status: TaskStatus.PENDING,
  heartbeat_lock: null,
  created_at: { toDate: () => new Date('2026-03-30T08:00:00Z') },
  agent: null,
  result_path: null,
  qa_verdict: null,
};

const completedTaskData = {
  ...pendingTaskData,
  status: TaskStatus.COMPLETED,
  agent: 'price-hunter',
  result_path: '/results/2026-03-30/task-001.md',
  qa_verdict: QAVerdict.PASS,
};

const mockTaskSnap = { exists: true, id: 'task-001', data: () => pendingTaskData };
const mockCompletedTaskSnap = { exists: true, id: 'task-001', data: () => completedTaskData };

const mockResultData = {
  task_id: 'task-001',
  agent: 'price-hunter',
  output: '## Results\nBest pick: Chemex',
  sources: [{ url: 'https://wirecutter.com', title: 'Wirecutter' }],
  qa_notes: null,
};
const mockResultSnap = { empty: false, docs: [{ data: () => mockResultData }] };

const mockGet = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockDocFn = jest.fn();
const mockRunTransaction = jest.fn();

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'tasks') {
      return {
        where: mockWhere,
        doc: mockDocFn,
      };
    }
    if (name === 'results') {
      return { where: mockWhere };
    }
    if (name === 'config') {
      return { doc: mockDocFn };
    }
    return { doc: mockDocFn };
  }),
  runTransaction: mockRunTransaction,
};

jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => mockDb),
}));

jest.mock('@/agents/runner', () => ({
  runAgent: jest.fn().mockResolvedValue('result-001'),
}));

jest.mock('@/discord/delivery', () => ({
  formatResultMessage: jest.fn().mockReturnValue('Formatted Discord message'),
}));

describe('releaseHeartbeatLock', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets heartbeat_lock to null on the task document', async () => {
    mockDocFn.mockReturnValue(mockTaskDocRef);
    await releaseHeartbeatLock('task-001');
    expect(mockUpdate).toHaveBeenCalledWith({ heartbeat_lock: null });
  });
});

describe('claimNextTask', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when no pending/queued tasks exist', async () => {
    // Chain: where().where().orderBy().orderBy().get()
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    mockDb.collection = jest.fn(() => mockQuery as any);
    mockRunTransaction.mockImplementation(async (fn: Function) => fn({ get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ heartbeat_lock: null }) }), update: mockUpdate }));

    const result = await claimNextTask();
    expect(result).toBeNull();
  });
});

describe('processHeartbeat', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when heartbeat_paused is true', async () => {
    const mockConfigDoc = {
      get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ heartbeat_paused: true }) }),
    };
    mockDb.collection = jest.fn((name: string) => ({
      doc: jest.fn(() => mockConfigDoc),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    })) as any;

    const result = await processHeartbeat();
    expect(result).toBeNull();
  });

  it('returns null when no task is claimable', async () => {
    const mockConfigDoc = {
      get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ heartbeat_paused: false }) }),
    };
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    mockDb.collection = jest.fn((name: string) => {
      if (name === 'config') return { doc: jest.fn(() => mockConfigDoc) };
      return mockQuery;
    }) as any;
    mockRunTransaction.mockImplementation(async (fn: Function) => fn({ get: jest.fn(), update: mockUpdate }));

    const result = await processHeartbeat();
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/heartbeat/index.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/heartbeat/index'`

- [ ] **Step 3: Implement**

Create `src/heartbeat/index.ts`:

```typescript
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

  // 'queued' < 'pending' alphabetically, so orderBy status ASC puts queued first
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

    // Attempt to claim via transaction
    try {
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(db.collection(TASKS_COLLECTION).doc(doc.id));
        if (!fresh.exists) return null;
        const freshData = fresh.data() as Task;
        const freshLockTime = freshData.heartbeat_lock ? freshData.heartbeat_lock.toDate().getTime() : null;
        const freshLockExpired = freshLockTime === null || now - freshLockTime > LOCK_TIMEOUT_MS;
        if (!freshLockExpired) return null;

        tx.update(db.collection(TASKS_COLLECTION).doc(doc.id), {
          heartbeat_lock: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id: doc.id, ...freshData } as Task;
      });

      if (claimed) return claimed;
    } catch {
      // Transaction conflict — another process claimed it; try next
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

  // Check pause flag
  const configSnap = await db.collection('config').doc('system').get();
  if (configSnap.exists && configSnap.data()?.heartbeat_paused === true) {
    return null;
  }

  // Claim a task
  const task = await claimNextTask();
  if (!task) return null;

  // Run the agent
  await runAgent({ taskId: task.id, title: task.title, listId: task.list_id as ListId });

  // Fetch updated task for QA verdict + agent name
  const updatedSnap = await db.collection(TASKS_COLLECTION).doc(task.id).get();
  const updated = updatedSnap.exists ? ({ id: updatedSnap.id, ...updatedSnap.data() } as Task) : task;

  // Fetch result document for output + sources
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/heartbeat/index.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add src/heartbeat/index.ts tests/heartbeat/index.test.ts
git commit -m "feat: add heartbeat processor with Firestore transaction lock"
```

---

## Task 5: Heartbeat CLI Script

**Files:**
- Create: `scripts/run-heartbeat.ts`
- Modify: `package.json` (add `"heartbeat"` script)

### What it does

Calls `processHeartbeat()` and prints JSON to stdout. If the result is not null, prints `{ taskId, title, discordMessage }`. If null (paused or nothing to do), prints `null`. Exits with code 0 in both cases. Unhandled errors exit with code 1 and print to stderr.

The Claude Code cron reads this stdout, checks if it's null, and if not, posts `discordMessage` to Discord via `mcp__plugin_discord_discord__reply`.

- [ ] **Step 1: Create the script**

Create `scripts/run-heartbeat.ts`:

```typescript
import { processHeartbeat } from '../src/heartbeat/index';

async function main() {
  try {
    const result = await processHeartbeat();
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Heartbeat error: ${err}\n`);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Add npm script to package.json**

In `package.json`, add to the `"scripts"` block:

```json
"heartbeat": "ts-node scripts/run-heartbeat.ts"
```

The scripts block should look like:

```json
"scripts": {
  "start": "node dist/src/server/index.js",
  "dev": "ts-node src/server/index.ts",
  "build": "tsc",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "init-db": "ts-node scripts/init-firestore.ts",
  "heartbeat": "ts-node scripts/run-heartbeat.ts",
  "morning-summary": "ts-node scripts/run-morning-summary.ts"
}
```

(Add `morning-summary` now too — it's used in Task 8.)

- [ ] **Step 3: Smoke test the script structure compiles**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors, not new ones from the new files)

- [ ] **Step 4: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add scripts/run-heartbeat.ts package.json
git commit -m "feat: add heartbeat CLI script and npm run heartbeat"
```

---

## Task 6: Morning Summary Generator

**Files:**
- Create: `src/discord/morning-summary.ts`
- Create: `tests/discord/morning-summary.test.ts`

### What it does

`generateMorningSummary()` queries Firestore `tasks` collection for documents where `created_at >= now - 24h`. Groups them by status. Formats a Discord message with a status table and a rotating motivational quote (10 hardcoded quotes, selected by `dayOfYear % 10`).

Output format:

```
**Admin Workflow — Morning Summary** (2026-03-30)

Tasks in last 24h:
• ✅ Completed: 3
• ❌ Failed: 1
• ⏳ Pending: 2
• 🔄 Running: 0

Recent completions:
• Find best coffee maker (price-hunter)
• Weekend trip to NYC (trip-scout)

---
💬 "Focus on being productive instead of busy." — Tim Ferriss
```

- [ ] **Step 1: Write the failing test**

Create `tests/discord/morning-summary.test.ts`:

```typescript
import { generateMorningSummary } from '@/discord/morning-summary';
import { TaskStatus } from '@/db/schema';

const FIXED_DATE = '2026-03-30';
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(`${FIXED_DATE}T07:00:00Z`));
});
afterAll(() => jest.useRealTimers());

const mockTasks = [
  { id: 't1', title: 'Find best coffee maker', status: TaskStatus.COMPLETED, agent: 'price-hunter', created_at: { toDate: () => new Date('2026-03-30T06:00:00Z') } },
  { id: 't2', title: 'Weekend trip NYC', status: TaskStatus.COMPLETED, agent: 'trip-scout', created_at: { toDate: () => new Date('2026-03-30T05:00:00Z') } },
  { id: 't3', title: 'Book restaurant', status: TaskStatus.FAILED, agent: 'experience-finder', created_at: { toDate: () => new Date('2026-03-30T04:00:00Z') } },
  { id: 't4', title: 'Plan study schedule', status: TaskStatus.PENDING, agent: null, created_at: { toDate: () => new Date('2026-03-30T03:00:00Z') } },
];

const mockGet = jest.fn().mockResolvedValue({
  docs: mockTasks.map(t => ({ id: t.id, data: () => t })),
});
const mockWhere = jest.fn().mockReturnThis();
const mockOrderBy = jest.fn().mockReturnThis();

jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: mockWhere,
      orderBy: mockOrderBy,
      get: mockGet,
    })),
  })),
}));

describe('generateMorningSummary', () => {
  it('includes the date in the header', async () => {
    const msg = await generateMorningSummary();
    expect(msg).toContain(FIXED_DATE);
  });

  it('counts completed tasks correctly', async () => {
    const msg = await generateMorningSummary();
    expect(msg).toContain('Completed: 2');
  });

  it('counts failed tasks correctly', async () => {
    const msg = await generateMorningSummary();
    expect(msg).toContain('Failed: 1');
  });

  it('counts pending tasks correctly', async () => {
    const msg = await generateMorningSummary();
    expect(msg).toContain('Pending: 1');
  });

  it('lists completed task titles', async () => {
    const msg = await generateMorningSummary();
    expect(msg).toContain('Find best coffee maker');
  });

  it('includes a motivational quote', async () => {
    const msg = await generateMorningSummary();
    // Any of the 10 quotes — just check the quote block exists
    expect(msg).toMatch(/💬 ".+"/);
  });

  it('stays within 2000 characters', async () => {
    const msg = await generateMorningSummary();
    expect(msg.length).toBeLessThanOrEqual(2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/discord/morning-summary.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/discord/morning-summary'`

- [ ] **Step 3: Implement**

Create `src/discord/morning-summary.ts`:

```typescript
import { getFirestore } from '@/db/firebase';
import { Task, TaskStatus } from '@/db/schema';
import * as admin from 'firebase-admin';

const QUOTES = [
  'Focus on being productive instead of busy. — Tim Ferriss',
  'The secret of getting ahead is getting started. — Tony Robbins',
  'If you set goals and go after them with all the determination you can muster, your gifts will take you places that will amaze you. — Tony Robbins',
  'What we can or cannot do, what we consider possible or impossible, is rarely a function of our true capability. — Tony Robbins',
  'You are the average of the five people you spend the most time with. — Tim Ferriss',
  "A person's success in life can usually be measured by the number of uncomfortable conversations he or she is willing to have. — Tim Ferriss",
  'The quality of your life is the quality of your relationships. — Tony Robbins',
  'Losers react; leaders anticipate. — Tony Robbins',
  "Conditions are never perfect. 'Someday' is a disease that will take your dreams to the grave with you. — Tim Ferriss",
  "It's not about the goal. It's about growing to become the person that can accomplish that goal. — Tony Robbins",
];

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function generateMorningSummary(): Promise<string> {
  const db = getFirestore();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoff);

  const snapshot = await db
    .collection('tasks')
    .where('created_at', '>=', cutoffTimestamp)
    .orderBy('created_at', 'desc')
    .get();

  const tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task));

  const counts = {
    [TaskStatus.COMPLETED]: 0,
    [TaskStatus.FAILED]: 0,
    [TaskStatus.PENDING]: 0,
    [TaskStatus.RUNNING]: 0,
    [TaskStatus.QUEUED]: 0,
  };
  for (const t of tasks) {
    if (t.status in counts) counts[t.status]++;
  }

  const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED).slice(0, 5);

  const date = now.toISOString().split('T')[0];
  const quote = QUOTES[getDayOfYear(now) % QUOTES.length];

  const completionsBlock =
    completedTasks.length > 0
      ? `\nRecent completions:\n${completedTasks.map(t => `• ${t.title}${t.agent ? ` (${t.agent})` : ''}`).join('\n')}`
      : '';

  const msg = [
    `**Admin Workflow — Morning Summary** (${date})`,
    '',
    'Tasks in last 24h:',
    `• ✅ Completed: ${counts[TaskStatus.COMPLETED]}`,
    `• ❌ Failed: ${counts[TaskStatus.FAILED]}`,
    `• ⏳ Pending: ${counts[TaskStatus.PENDING]}`,
    `• 🔄 Running: ${counts[TaskStatus.RUNNING]}`,
    completionsBlock,
    '',
    '---',
    `💬 "${quote}"`,
  ]
    .join('\n')
    .trim();

  return msg.length <= 2000 ? msg : msg.slice(0, 1997) + '...';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/discord/morning-summary.test.ts --no-coverage
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add src/discord/morning-summary.ts tests/discord/morning-summary.test.ts
git commit -m "feat: add morning summary generator with rotating quotes"
```

---

## Task 7: Morning Summary CLI Script

**Files:**
- Create: `scripts/run-morning-summary.ts`

### What it does

Calls `generateMorningSummary()` and prints the string to stdout. The Claude Code cron reads stdout and posts it to Discord.

- [ ] **Step 1: Create the script**

Create `scripts/run-morning-summary.ts`:

```typescript
import { generateMorningSummary } from '../src/discord/morning-summary';

async function main() {
  try {
    const message = await generateMorningSummary();
    process.stdout.write(message + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Morning summary error: ${err}\n`);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Verify package.json already has the script**

Check that `package.json` has `"morning-summary": "ts-node scripts/run-morning-summary.ts"` (added in Task 5). If not, add it now.

- [ ] **Step 3: Smoke test compilation**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx tsc --noEmit
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add scripts/run-morning-summary.ts
git commit -m "feat: add morning summary CLI script"
```

---

## Task 8: Discord Command Handler

**Files:**
- Create: `src/discord/commands.ts`
- Create: `tests/discord/commands.test.ts`

### What it does

`handleCommand(text)` parses a Discord text message for known commands and writes to Firestore. Returns `{ response: string }`.

Supported commands (case-insensitive trim):
- `pause agents` → sets `config/system.heartbeat_paused = true` → responds `"Agents paused. No tasks will be processed until resumed."`
- `resume agents` → sets `config/system.heartbeat_paused = false` → responds `"Agents resumed. Heartbeat will process tasks normally."`
- `set morning summary to Xam` (where X is 1–12) → updates `config/system.morning_summary_cron` → responds `"Morning summary scheduled for Xam daily."`
- Unknown command → responds `"Unknown command. Available: pause agents, resume agents, set morning summary to Xam"`

- [ ] **Step 1: Write the failing test**

Create `tests/discord/commands.test.ts`:

```typescript
import { handleCommand } from '@/discord/commands';

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDocRef = { set: mockSet };
const mockDocFn = jest.fn(() => mockDocRef);

jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({ doc: mockDocFn })),
  })),
}));

describe('handleCommand', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pause agents sets heartbeat_paused to true', async () => {
    const result = await handleCommand('pause agents');
    expect(mockDocFn).toHaveBeenCalledWith('system');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeat_paused: true }),
      { merge: true }
    );
    expect(result.response).toContain('paused');
  });

  it('resume agents sets heartbeat_paused to false', async () => {
    const result = await handleCommand('resume agents');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeat_paused: false }),
      { merge: true }
    );
    expect(result.response).toContain('resumed');
  });

  it('set morning summary to 8am sets correct cron', async () => {
    const result = await handleCommand('set morning summary to 8am');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ morning_summary_cron: '0 8 * * *' }),
      { merge: true }
    );
    expect(result.response).toContain('8am');
  });

  it('set morning summary to 7am sets correct cron', async () => {
    await handleCommand('set morning summary to 7am');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ morning_summary_cron: '0 7 * * *' }),
      { merge: true }
    );
  });

  it('is case insensitive', async () => {
    const result = await handleCommand('PAUSE AGENTS');
    expect(result.response).toContain('paused');
  });

  it('returns unknown command message for unrecognised input', async () => {
    const result = await handleCommand('do something random');
    expect(result.response).toContain('Unknown command');
    expect(mockSet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/discord/commands.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/discord/commands'`

- [ ] **Step 3: Implement**

Create `src/discord/commands.ts`:

```typescript
import { getFirestore } from '@/db/firebase';

interface CommandResult {
  response: string;
}

const CONFIG_COLLECTION = 'config';
const SYSTEM_DOC = 'system';

const UNKNOWN_RESPONSE =
  'Unknown command. Available: pause agents, resume agents, set morning summary to Xam';

export async function handleCommand(text: string): Promise<CommandResult> {
  const normalised = text.trim().toLowerCase();
  const db = getFirestore();
  const ref = db.collection(CONFIG_COLLECTION).doc(SYSTEM_DOC);

  if (normalised === 'pause agents') {
    await ref.set({ heartbeat_paused: true }, { merge: true });
    return { response: 'Agents paused. No tasks will be processed until resumed.' };
  }

  if (normalised === 'resume agents') {
    await ref.set({ heartbeat_paused: false }, { merge: true });
    return { response: 'Agents resumed. Heartbeat will process tasks normally.' };
  }

  const morningMatch = normalised.match(/^set morning summary to (\d{1,2})am$/);
  if (morningMatch) {
    const hour = parseInt(morningMatch[1], 10);
    if (hour >= 1 && hour <= 12) {
      await ref.set({ morning_summary_cron: `0 ${hour} * * *` }, { merge: true });
      return { response: `Morning summary scheduled for ${hour}am daily.` };
    }
  }

  return { response: UNKNOWN_RESPONSE };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/discord/commands.test.ts --no-coverage
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add src/discord/commands.ts tests/discord/commands.test.ts
git commit -m "feat: add Discord command handler for pause/resume/schedule"
```

---

## Task 9: Discord Feedback Processor

**Files:**
- Create: `src/discord/feedback.ts`
- Create: `tests/discord/feedback.test.ts`

### What it does

Two exports:

1. **`processReaction(taskId, emoji)`**:
   - `✅` — reads the task's result sources and calls `updateMemoryAfterRun(agent, successfulSources, [])` to boost them
   - `❌` — reads the task's result sources and calls `updateMemoryAfterRun(agent, [], blockedSources)` to mark them low-quality
   - `🔄` — clears the cache entry for the task (deletes from `cache` collection where `task_id == taskId`) and re-queues: calls `updateTaskStatus(taskId, TaskStatus.QUEUED)`

2. **`processReply(taskId, replyText)`**:
   - Calls Claude Haiku to extract a user preference from the reply text.
   - System prompt: `"You extract user preferences from feedback messages. Output JSON: { scope: 'global' | 'agent', agentName?: string, preference: string }"`
   - Reads the task to get `agent` name.
   - If scope is `global`, writes to `memory/global.user_preferences`; if scope is `agent`, writes to `memory/{agentName}.user_preferences`.
   - Uses Firestore `set({ merge: true })` to avoid overwriting other preferences.

- [ ] **Step 1: Write the failing test**

Create `tests/discord/feedback.test.ts`:

```typescript
import { processReaction, processReply } from '@/discord/feedback';
import { TaskStatus } from '@/db/schema';

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockDelete = jest.fn().mockResolvedValue(undefined);
const mockSet = jest.fn().mockResolvedValue(undefined);

const taskData = {
  id: 'task-001',
  title: 'Find best coffee maker',
  status: TaskStatus.COMPLETED,
  agent: 'price-hunter',
  list_id: 'price-hunt',
};

const resultData = {
  task_id: 'task-001',
  agent: 'price-hunter',
  sources: [
    { url: 'https://wirecutter.com', title: 'Wirecutter' },
    { url: 'https://rtings.com', title: 'RTINGS' },
  ],
};

const mockTaskDocRef = { get: jest.fn().mockResolvedValue({ exists: true, data: () => taskData }), update: mockUpdate };
const mockResultQuery = {
  get: jest.fn().mockResolvedValue({ empty: false, docs: [{ data: () => resultData }] }),
};
const mockCacheQuery = {
  get: jest.fn().mockResolvedValue({ docs: [{ ref: { delete: mockDelete } }] }),
};
const mockMemoryDocRef = { set: mockSet };

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'tasks') return { doc: jest.fn(() => mockTaskDocRef) };
    if (name === 'results') return { where: jest.fn().mockReturnValue(mockResultQuery) };
    if (name === 'cache') return { where: jest.fn().mockReturnValue(mockCacheQuery) };
    if (name === 'memory') return { doc: jest.fn(() => mockMemoryDocRef) };
    return {};
  }),
};

jest.mock('@/db/firebase', () => ({ getFirestore: jest.fn(() => mockDb) }));
jest.mock('@/db/tasks', () => ({ updateTaskStatus: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/memory/index', () => ({ updateMemoryAfterRun: jest.fn().mockResolvedValue(undefined) }));

const mockCreate = jest.fn().mockResolvedValue({ content: [{ text: '{"scope":"global","preference":"prefers budget options under $100"}' }] });
jest.mock('@/claude', () => ({
  getClient: jest.fn(() => ({ messages: { create: mockCreate } })),
}));

describe('processReaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('✅ boosts sources via updateMemoryAfterRun', async () => {
    const { updateMemoryAfterRun } = require('@/memory/index');
    await processReaction('task-001', '✅');
    expect(updateMemoryAfterRun).toHaveBeenCalledWith(
      'price-hunter',
      ['https://wirecutter.com', 'https://rtings.com'],
      []
    );
  });

  it('❌ marks sources low-quality via updateMemoryAfterRun', async () => {
    const { updateMemoryAfterRun } = require('@/memory/index');
    await processReaction('task-001', '❌');
    expect(updateMemoryAfterRun).toHaveBeenCalledWith(
      'price-hunter',
      [],
      ['https://wirecutter.com', 'https://rtings.com']
    );
  });

  it('🔄 deletes cache and re-queues the task', async () => {
    const { updateTaskStatus } = require('@/db/tasks');
    await processReaction('task-001', '🔄');
    expect(mockDelete).toHaveBeenCalled();
    expect(updateTaskStatus).toHaveBeenCalledWith('task-001', TaskStatus.QUEUED);
  });

  it('unknown emoji does nothing', async () => {
    const { updateMemoryAfterRun } = require('@/memory/index');
    const { updateTaskStatus } = require('@/db/tasks');
    await processReaction('task-001', '👍');
    expect(updateMemoryAfterRun).not.toHaveBeenCalled();
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });
});

describe('processReply', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes global preference to memory/global', async () => {
    await processReply('task-001', 'I prefer budget options under $100');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ user_preferences: expect.any(Object) }),
      { merge: true }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/discord/feedback.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/discord/feedback'`

- [ ] **Step 3: Implement**

Create `src/discord/feedback.ts`:

```typescript
import { getFirestore } from '@/db/firebase';
import { TaskStatus } from '@/db/schema';
import { updateTaskStatus } from '@/db/tasks';
import { updateMemoryAfterRun } from '@/memory/index';
import { getClient } from '@/claude';

const PREFERENCE_EXTRACTION_PROMPT = `You extract user preferences from feedback messages about research tasks.
Output ONLY valid JSON with this structure:
{ "scope": "global" | "agent", "agentName": "<string, only if scope=agent>", "preference": "<concise preference string>" }
Do not include any explanation.`;

export async function processReaction(taskId: string, emoji: string): Promise<void> {
  const db = getFirestore();

  if (emoji === '✅' || emoji === '❌') {
    // Fetch task to get agent name
    const taskSnap = await db.collection('tasks').doc(taskId).get();
    if (!taskSnap.exists) return;
    const task = taskSnap.data()!;
    const agentName: string = task.agent ?? 'unknown';

    // Fetch result to get sources
    const resultSnap = await db
      .collection('results')
      .where('task_id', '==', taskId)
      .get();
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
    // Delete cache entries for this task
    const cacheSnap = await db
      .collection('cache')
      .where('task_id', '==', taskId)
      .get();
    await Promise.all(cacheSnap.docs.map(d => d.ref.delete()));

    // Re-queue the task
    await updateTaskStatus(taskId, TaskStatus.QUEUED);
    return;
  }

  // Unknown emoji — do nothing
}

export async function processReply(taskId: string, replyText: string): Promise<void> {
  const db = getFirestore();

  // Fetch task to get agent name
  const taskSnap = await db.collection('tasks').doc(taskId).get();
  const agentName: string = taskSnap.exists ? (taskSnap.data()!.agent ?? 'unknown') : 'unknown';

  // Extract preference via Haiku
  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    system: PREFERENCE_EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: replyText }],
  });

  let parsed: { scope: string; agentName?: string; preference: string };
  try {
    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
    parsed = JSON.parse(raw);
  } catch {
    return; // Unparseable — skip silently
  }

  const { scope, preference } = parsed;
  const targetDoc = scope === 'agent' ? (parsed.agentName ?? agentName) : 'global';

  await db
    .collection('memory')
    .doc(targetDoc)
    .set(
      { user_preferences: { [Date.now().toString()]: preference } },
      { merge: true }
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest tests/discord/feedback.test.ts --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add src/discord/feedback.ts tests/discord/feedback.test.ts
git commit -m "feat: add Discord feedback processor for reactions and replies"
```

---

## Task 10: CronCreate — Heartbeat and Morning Summary Crons

**Files:**
- No source files — this task configures Claude Code cron jobs

### What it does

Two cron jobs are created in Claude Code settings:

1. **Heartbeat cron** — runs every 30 minutes. Calls `npm run heartbeat`, reads stdout JSON. If not null, posts `discordMessage` to Discord via `mcp__plugin_discord_discord__reply`.

2. **Morning summary cron** — runs daily at 7am. Calls `npm run morning-summary`, reads stdout. Posts to Discord.

The cron jobs must `cd` into the project directory before running the npm scripts.

- [ ] **Step 1: Create the heartbeat cron**

Use the `CronCreate` tool with:
- Schedule: `*/30 * * * *`
- Prompt:
```
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow" && npm run heartbeat
```
Parse the stdout as JSON. If the result is not null (i.e., it has a `discordMessage` field), post the value of `discordMessage` to Discord using mcp__plugin_discord_discord__reply with the configured channel.

- [ ] **Step 2: Create the morning summary cron**

Use the `CronCreate` tool with:
- Schedule: `0 7 * * *`
- Prompt:
```
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow" && npm run morning-summary
```
Post the stdout string directly to Discord using mcp__plugin_discord_discord__reply.

- [ ] **Step 3: Verify crons are listed**

Use `CronList` to confirm both crons appear with correct schedules.

---

## Task 11: Full Test Suite Run

**Files:**
- No new files — verification step

### What it does

Run the complete test suite to confirm all new modules pass alongside the existing tests from Plans 1 and 2.

- [ ] **Step 1: Run all tests**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest --no-coverage
```

Expected: all tests pass. Target: 50+ tests total across all modules.

- [ ] **Step 2: Run with coverage report**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npx jest --coverage
```

Review: `src/token-log/`, `src/discord/`, `src/heartbeat/` should all show meaningful coverage.

- [ ] **Step 3: Final commit**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
git add -A
git commit -m "test: verify full suite passes — Plan 3 orchestration complete"
```

---

## Summary of New Modules and Their Public APIs

| Module | Export | Purpose |
|---|---|---|
| `src/token-log/index.ts` | `incrementTokenLog(agent, tokensUsed)` | Atomic token counter in Firestore |
| `src/discord/delivery.ts` | `formatResultMessage(params)` | Pure Discord message formatter (≤2000 chars) |
| `src/discord/morning-summary.ts` | `generateMorningSummary()` | Daily status digest with quotes |
| `src/discord/commands.ts` | `handleCommand(text)` | Text command parser → Firestore writer |
| `src/discord/feedback.ts` | `processReaction(taskId, emoji)`, `processReply(taskId, text)` | User feedback handler |
| `src/heartbeat/index.ts` | `claimNextTask()`, `processHeartbeat()`, `releaseHeartbeatLock(id)` | Autonomous task processor |
| `scripts/run-heartbeat.ts` | CLI | Outputs JSON heartbeat result to stdout |
| `scripts/run-morning-summary.ts` | CLI | Outputs morning summary string to stdout |

**Discord posting reminder:** All actual Discord message sending uses the Claude Code MCP plugin (`mcp__plugin_discord_discord__reply`), not any Node.js Discord library. The TypeScript modules only format content.
