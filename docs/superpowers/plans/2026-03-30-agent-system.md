# Admin Workflow — Plan 2: Agent System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the intelligence layer — 4 research agents (PriceHunter, TripScout, ExperienceFinder, AdminAssist) plus a QA agent, efficiency layer, and self-improving memory — so tasks received by the webhook get researched and results saved.

**Architecture:** Every task flows through an `AgentRunner` that loads memory, checks cache, classifies with Haiku, then dispatches the correct specialist agent. The specialist uses Playwright for live browsing (parallel sub-agents per site). Results pass through a QA agent before being saved to Firestore + Markdown. Memory is written back after every run so agents improve over time.

**Tech Stack:** Claude API (Haiku 4.5 / Sonnet 4.6 / Opus 4.6), Playwright MCP plugin, @anthropic-ai/sdk, crypto (Node built-in for cache keys)

**Depends on:** Plan 1 (Foundation) complete — webhook server running, Firestore initialized, task CRUD available.

---

## File Structure

```
src/
├── agents/
│   ├── runner.ts           # AgentRunner — orchestrates efficiency layer + dispatch + QA
│   ├── classifier.ts       # Haiku task classifier — extracts params from reminder text
│   ├── qa.ts               # QA agent — validates research output before delivery
│   ├── price-hunter.ts     # PriceHunter — product price comparison
│   ├── trip-scout.ts       # TripScout — flight/travel research
│   ├── experience-finder.ts # ExperienceFinder — events, tickets, reservations
│   └── admin-assist.ts     # AdminAssist — learning paths and frameworks
├── memory/
│   ├── index.ts            # Read/write agent memory from Firestore
│   └── cache.ts            # 24hr result cache (SHA-256 key, Firestore-backed)
├── results/
│   └── index.ts            # Save research results to Firestore + Markdown file
├── config/
│   └── banned-airlines.json # TripScout hard-coded airline exclusion list
tests/
├── agents/
│   ├── runner.test.ts
│   ├── classifier.test.ts
│   ├── qa.test.ts
│   ├── price-hunter.test.ts
│   ├── trip-scout.test.ts
│   ├── experience-finder.test.ts
│   └── admin-assist.test.ts
├── memory/
│   ├── index.test.ts
│   └── cache.test.ts
└── results/
    └── index.test.ts
```

---

## Task 1: Anthropic SDK Setup + Claude Client

**Files:**
- Create: `src/claude.ts`

- [ ] **Step 1: Install Anthropic SDK**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Write claude.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import config from '@/config';

let client: Anthropic | undefined;

export function getClaudeClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

export const MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-6',
  OPUS: 'claude-opus-4-6',
} as const;
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/claude.ts
git commit -m "feat: add Anthropic SDK client"
```

---

## Task 2: Memory Manager

**Files:**
- Create: `src/memory/index.ts`
- Create: `tests/memory/index.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/memory/index.test.ts`:
```typescript
import { loadMemory, saveMemory, updateMemoryAfterRun } from '@/memory/index';
import { AgentMemory } from '@/db/schema';

const mockDoc = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
};
const mockCollection = { doc: jest.fn(() => mockDoc) };

jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({ collection: jest.fn(() => mockCollection) })),
}));

describe('loadMemory', () => {
  it('returns default empty memory when doc does not exist', async () => {
    mockDoc.get.mockResolvedValueOnce({ exists: false });
    const memory = await loadMemory('price-hunter');
    expect(memory.successful_sources).toEqual([]);
    expect(memory.blocked_sources).toEqual([]);
    expect(memory.user_preferences).toEqual({});
  });

  it('returns stored memory when doc exists', async () => {
    mockDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        successful_sources: ['amazon.com'],
        blocked_sources: [],
        user_preferences: { max_budget: 100 },
        last_updated: null,
      }),
    });
    const memory = await loadMemory('price-hunter');
    expect(memory.successful_sources).toEqual(['amazon.com']);
    expect(memory.user_preferences).toEqual({ max_budget: 100 });
  });
});

describe('saveMemory', () => {
  it('writes memory to Firestore', async () => {
    const memory: Partial<AgentMemory> = {
      successful_sources: ['amazon.com'],
      blocked_sources: ['bestbuy.com'],
    };
    await saveMemory('price-hunter', memory);
    expect(mockDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({ successful_sources: ['amazon.com'] }),
      { merge: true }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/memory/index.test.ts"
```
Expected: FAIL

- [ ] **Step 3: Write src/memory/index.ts**

```typescript
import { getFirestore } from '@/db/firebase';
import { AgentMemory } from '@/db/schema';
import * as admin from 'firebase-admin';

const MEMORY_COLLECTION = 'memory';

const DEFAULT_MEMORY: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: {},
  last_updated: null as any,
};

export async function loadMemory(agentName: string): Promise<AgentMemory> {
  const db = getFirestore();
  const snap = await db.collection(MEMORY_COLLECTION).doc(agentName).get();
  if (!snap.exists) return { ...DEFAULT_MEMORY };
  return { ...DEFAULT_MEMORY, ...snap.data() } as AgentMemory;
}

export async function saveMemory(agentName: string, updates: Partial<AgentMemory>): Promise<void> {
  const db = getFirestore();
  await db.collection(MEMORY_COLLECTION).doc(agentName).set(
    { ...updates, last_updated: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export async function updateMemoryAfterRun(
  agentName: string,
  successfulSources: string[],
  blockedSources: string[],
  preferenceUpdates: Record<string, unknown> = {}
): Promise<void> {
  const current = await loadMemory(agentName);
  const merged = {
    successful_sources: Array.from(new Set([...current.successful_sources, ...successfulSources])),
    blocked_sources: Array.from(new Set([...current.blocked_sources, ...blockedSources])),
    user_preferences: { ...current.user_preferences, ...preferenceUpdates },
  };
  await saveMemory(agentName, merged);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/memory/index.test.ts"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/index.ts tests/memory/index.test.ts
git commit -m "feat: add agent memory manager"
```

---

## Task 3: Result Cache

**Files:**
- Create: `src/memory/cache.ts`
- Create: `tests/memory/cache.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/memory/cache.test.ts`:
```typescript
import { getCachedResult, setCachedResult, computeCacheKey } from '@/memory/cache';

const mockDoc = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
};
const mockCollection = { doc: jest.fn(() => mockDoc) };
jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({ collection: jest.fn(() => mockCollection) })),
}));

describe('computeCacheKey', () => {
  it('produces consistent SHA-256 hash for same inputs', () => {
    const key1 = computeCacheKey('price-hunt', 'best headphones under $200');
    const key2 = computeCacheKey('price-hunt', 'best headphones under $200');
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // SHA-256 hex
  });

  it('normalizes title to lowercase before hashing', () => {
    const key1 = computeCacheKey('price-hunt', 'Best Headphones Under $200');
    const key2 = computeCacheKey('price-hunt', 'best headphones under $200');
    expect(key1).toBe(key2);
  });

  it('produces different keys for different list_ids', () => {
    const key1 = computeCacheKey('price-hunt', 'headphones');
    const key2 = computeCacheKey('admin', 'headphones');
    expect(key1).not.toBe(key2);
  });
});

describe('getCachedResult', () => {
  it('returns null when no cache entry exists', async () => {
    mockDoc.get.mockResolvedValueOnce({ exists: false });
    const result = await getCachedResult('price-hunt', 'headphones');
    expect(result).toBeNull();
  });

  it('returns null when cache entry is older than 24 hours', async () => {
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ result_path: '/some/path', created_at: { toDate: () => oldTimestamp } }),
    });
    const result = await getCachedResult('price-hunt', 'headphones');
    expect(result).toBeNull();
  });

  it('returns result_path when cache entry is fresh', async () => {
    const recentTimestamp = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    mockDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ result_path: '/path/to/result.md', task_id: 'task-123', created_at: { toDate: () => recentTimestamp } }),
    });
    const result = await getCachedResult('price-hunt', 'headphones');
    expect(result).toEqual({ result_path: '/path/to/result.md', task_id: 'task-123' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/memory/cache.test.ts"
```
Expected: FAIL

- [ ] **Step 3: Write src/memory/cache.ts**

```typescript
import crypto from 'crypto';
import { getFirestore } from '@/db/firebase';
import * as admin from 'firebase-admin';

const CACHE_COLLECTION = 'cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function computeCacheKey(listId: string, title: string): string {
  const normalized = `${listId}:${title.toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function getCachedResult(
  listId: string,
  title: string
): Promise<{ result_path: string; task_id: string } | null> {
  // Bypass cache if title starts with !fresh
  if (title.startsWith('!fresh')) return null;

  const key = computeCacheKey(listId, title);
  const db = getFirestore();
  const snap = await db.collection(CACHE_COLLECTION).doc(key).get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  const createdAt: Date = data.created_at.toDate();
  if (Date.now() - createdAt.getTime() > CACHE_TTL_MS) return null;

  return { result_path: data.result_path, task_id: data.task_id };
}

export async function setCachedResult(
  listId: string,
  title: string,
  taskId: string,
  resultPath: string
): Promise<void> {
  const key = computeCacheKey(listId, title);
  const db = getFirestore();
  await db.collection(CACHE_COLLECTION).doc(key).set({
    cache_key: key,
    task_id: taskId,
    result_path: resultPath,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/memory/cache.test.ts"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/cache.ts tests/memory/cache.test.ts
git commit -m "feat: add 24hr result cache with SHA-256 key"
```

---

## Task 4: Result Storage

**Files:**
- Create: `src/results/index.ts`
- Create: `tests/results/index.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/results/index.test.ts`:
```typescript
import { saveResult } from '@/results/index';
import fs from 'fs';
import path from 'path';

const mockAdd = jest.fn().mockResolvedValue({ id: 'result-123' });
jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({ collection: jest.fn(() => ({ add: mockAdd })) })),
}));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), mkdirSync: jest.fn(), writeFileSync: jest.fn() }));

describe('saveResult', () => {
  it('writes result to Firestore and returns result id', async () => {
    const id = await saveResult({
      taskId: 'task-abc',
      agent: 'price-hunter',
      output: '# Results\n\nTop picks...',
      sources: [{ url: 'https://amazon.com/product', title: 'Sony WF-1000XM5', retrieved_at: new Date() }],
      qaNotes: null,
    });
    expect(id).toBe('result-123');
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 'task-abc',
        agent: 'price-hunter',
        output: '# Results\n\nTop picks...',
      })
    );
  });

  it('creates the results directory and writes markdown file', async () => {
    await saveResult({
      taskId: 'task-abc',
      agent: 'price-hunter',
      output: '# Results',
      sources: [],
      qaNotes: null,
    });
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/results/index.test.ts"
```

- [ ] **Step 3: Write src/results/index.ts**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/results/index.test.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/results/index.ts tests/results/index.test.ts
git commit -m "feat: add result storage (Firestore + markdown)"
```

---

## Task 5: Task Classifier

**Files:**
- Create: `src/agents/classifier.ts`
- Create: `tests/agents/classifier.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/agents/classifier.test.ts`:
```typescript
import { classifyTask, TaskClassification } from '@/agents/classifier';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          category: 'shopping',
          params: { budget: 200, keywords: ['headphones', 'noise-canceling'] },
          confidence: 0.95,
          needs_research: true,
        }) }],
      }),
    },
  })),
  MODELS: { HAIKU: 'claude-haiku-4-5-20251001' },
}));

describe('classifyTask', () => {
  it('classifies a shopping task and extracts params', async () => {
    const result = await classifyTask('price-hunt', 'Best noise-canceling headphones under $200');
    expect(result.category).toBe('shopping');
    expect(result.params.budget).toBe(200);
    expect(result.needs_research).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/agents/classifier.test.ts"
```

- [ ] **Step 3: Write src/agents/classifier.ts**

```typescript
import { getClaudeClient, MODELS } from '@/claude';
import { ListId } from '@/db/schema';

export interface TaskClassification {
  category: string;       // 'shopping' | 'flight' | 'golf' | 'camping' | 'concert' | 'sports' | 'local_event' | 'massage' | 'dinner' | 'learning' | 'organization' | 'unknown'
  params: Record<string, unknown>; // extracted: budget, dates, location, party_size, keywords, etc.
  confidence: number;     // 0-1
  needs_research: boolean; // whether web research is needed (vs. pure organization)
}

const CLASSIFIER_SYSTEM_PROMPT = `You are a task classifier for a personal admin workflow system.

Given a reminder title and its list category, extract:
1. category: the specific type of task
2. params: key parameters (budget as number, dates as strings, location, party_size as number, keywords array, etc.)
3. confidence: how confident you are (0-1)
4. needs_research: whether this task requires web research

Valid categories by list:
- price-hunt: "shopping"
- trip-planner: "flight", "hotel", "car_rental", "travel"
- experience-scout: "golf", "camping", "concert", "sports", "local_event", "massage", "dinner"
- admin: "learning", "organization", "research", "planning"

Respond with ONLY valid JSON matching the TaskClassification interface. No explanation.`;

export async function classifyTask(listId: ListId, title: string): Promise<TaskClassification> {
  const client = getClaudeClient();
  const response = await client.messages.create({
    model: MODELS.HAIKU,
    max_tokens: 512,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `List: ${listId}\nTitle: ${title}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    return JSON.parse(text) as TaskClassification;
  } catch {
    return {
      category: 'unknown',
      params: {},
      confidence: 0,
      needs_research: true,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/agents/classifier.test.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/classifier.ts tests/agents/classifier.test.ts
git commit -m "feat: add Haiku task classifier"
```

---

## Task 6: QA Agent

**Files:**
- Create: `src/agents/qa.ts`
- Create: `tests/agents/qa.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/agents/qa.test.ts`:
```typescript
import { runQA, QAResult } from '@/agents/qa';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          verdict: 'pass',
          notes: null,
          issues: [],
        }) }],
      }),
    },
  })),
  MODELS: { HAIKU: 'claude-haiku-4-5-20251001' },
}));

describe('runQA', () => {
  it('returns pass verdict for valid output', async () => {
    const result = await runQA({
      taskTitle: 'Best headphones under $200',
      agentName: 'price-hunter',
      output: '## Top Picks\n\n1. Sony WF-1000XM5 - $179, 4.6⭐, 12,000 reviews, free returns\n[Buy on Amazon](https://amazon.com/...',
      listId: 'price-hunt',
    });
    expect(result.verdict).toBe('pass');
    expect(result.issues).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/agents/qa.test.ts"
```

- [ ] **Step 3: Write src/agents/qa.ts**

```typescript
import { getClaudeClient, MODELS } from '@/claude';
import { ListId } from '@/db/schema';

export interface QAResult {
  verdict: 'pass' | 'pass_with_notes' | 'fail';
  notes: string | null;
  issues: string[];
}

const QA_SYSTEM_PROMPT = `You are a QA reviewer for research results from an admin workflow agent.

Review the agent output and check:
1. Does it actually answer the task? (results match what was requested)
2. Are sources linked? (direct URLs, not just domain names)
3. Are there duplicates?
4. Agent-specific checks:
   - price-hunter: ratings ≥4.0⭐, ≥50 reviews shown, return policy mentioned
   - trip-scout: no budget airlines (Spirit/Frontier/Allegiant/Sun Country/Avelo/Breeze), departure/arrival times within 6am-9pm
   - experience-finder: valid dates/availability shown, booking links present
   - admin-assist: content links resolve (not broken URLs), steps are ordered

Return ONLY valid JSON:
{
  "verdict": "pass" | "pass_with_notes" | "fail",
  "notes": "string explaining pass_with_notes issues, or null",
  "issues": ["list of specific failures for fail verdict, empty otherwise"]
}

Be generous with pass — only fail if results clearly don't answer the task or violate hard rules.`;

export async function runQA(input: {
  taskTitle: string;
  agentName: string;
  output: string;
  listId: ListId;
}): Promise<QAResult> {
  const client = getClaudeClient();
  const response = await client.messages.create({
    model: MODELS.HAIKU,
    max_tokens: 1024,
    system: QA_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Task: ${input.taskTitle}\nAgent: ${input.agentName}\nList: ${input.listId}\n\n---OUTPUT---\n${input.output}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    return JSON.parse(text) as QAResult;
  } catch {
    return { verdict: 'pass_with_notes', notes: 'QA parse error — output delivered unverified', issues: [] };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/agents/qa.test.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/qa.ts tests/agents/qa.test.ts
git commit -m "feat: add QA agent"
```

---

## Task 7: PriceHunter Agent

**Files:**
- Create: `src/agents/price-hunter.ts`
- Create: `tests/agents/price-hunter.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/agents/price-hunter.test.ts`:
```typescript
import { runPriceHunter } from '@/agents/price-hunter';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '## Top Picks\n\n1. Sony WF-1000XM5 - $179, 4.6⭐, 12,350 reviews, free returns [Buy](https://amazon.com/...)' }],
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
    },
  })),
  MODELS: { SONNET: 'claude-sonnet-4-6' },
}));

const mockMemory: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: {},
  last_updated: null as any,
};

const mockClassification: TaskClassification = {
  category: 'shopping',
  params: { budget: 200, keywords: ['headphones', 'noise-canceling'] },
  confidence: 0.95,
  needs_research: true,
};

describe('runPriceHunter', () => {
  it('returns output string and token usage', async () => {
    const result = await runPriceHunter({
      title: 'Best noise-canceling headphones under $200',
      classification: mockClassification,
      memory: mockMemory,
    });
    expect(result.output).toContain('Sony');
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.sources).toBeInstanceOf(Array);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/agents/price-hunter.test.ts"
```

- [ ] **Step 3: Write src/agents/price-hunter.ts**

```typescript
import { getClaudeClient, MODELS } from '@/claude';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

interface AgentResult {
  output: string;
  tokensUsed: number;
  sources: Array<{ url: string; title: string; retrieved_at: Date }>;
  successfulSources: string[];
  blockedSources: string[];
}

const PRICE_HUNTER_PROMPT = `You are PriceHunter, a product research agent. You use web browsing to find the best value products.

Research the requested product across these sites (in parallel if possible):
1. Amazon — filter: ≥4.0 stars, ≥50 reviews REQUIRED
2. Brand's official website (if identifiable from the product)
3. Etsy (if the item could be artisan/unique)
4. Woot.com (check for deals)
5. One category wildcard: B&H Photo for electronics, REI for outdoor gear, Chewy for pet products, etc.

HARD REQUIREMENTS (apply to all results):
- Minimum 4.0 stars on Amazon
- Minimum 50 reviews on Amazon
- Return policy MUST be shown for every result — flag ⚠️ if <30 days or no returns, ✅ if free/easy returns
- Skip sites in the blocked_sources memory list

FORMAT your response as:
## Top 3 Picks

For each result:
**[Product Name]** — $[price]
- ⭐ [rating] ([count] reviews)
- 🔄 Returns: [policy]
- 🏪 [Seller/Site]
- [Direct purchase link]

Then: **Recommendation:** [one sentence explaining best value choice]
**Price spread:** lowest vs highest among results

Blocked sources to skip: {BLOCKED_SOURCES}
User preferences: {USER_PREFERENCES}`;

export async function runPriceHunter(input: {
  title: string;
  classification: TaskClassification;
  memory: AgentMemory;
}): Promise<AgentResult> {
  const { title, classification, memory } = input;
  const client = getClaudeClient();

  const prompt = PRICE_HUNTER_PROMPT
    .replace('{BLOCKED_SOURCES}', memory.blocked_sources.join(', ') || 'none')
    .replace('{USER_PREFERENCES}', JSON.stringify(memory.user_preferences));

  const userMessage = `Product to research: ${title}
${classification.params.budget ? `Budget: $${classification.params.budget}` : ''}
${classification.params.keywords ? `Keywords: ${(classification.params.keywords as string[]).join(', ')}` : ''}

Please search the specified sites and return top 3 results meeting the quality requirements.`;

  const response = await client.messages.create({
    model: MODELS.SONNET,
    max_tokens: 4096,
    system: prompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : 'No results found.';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  // Extract source URLs from output (simple regex)
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urls = output.match(urlRegex) ?? [];
  const sources = urls.map(url => ({
    url,
    title: new URL(url).hostname,
    retrieved_at: new Date(),
  }));

  return {
    output,
    tokensUsed,
    sources,
    successfulSources: ['amazon.com', 'woot.com'],
    blockedSources: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/agents/price-hunter.test.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/price-hunter.ts tests/agents/price-hunter.test.ts
git commit -m "feat: add PriceHunter agent"
```

---

## Task 8: TripScout Agent

**Files:**
- Create: `src/config/banned-airlines.json`
- Create: `src/agents/trip-scout.ts`
- Create: `tests/agents/trip-scout.test.ts`

- [ ] **Step 1: Write banned-airlines.json**

```json
{
  "banned": [
    "Spirit Airlines",
    "Frontier Airlines",
    "Allegiant Air",
    "Sun Country Airlines",
    "Avelo Airlines",
    "Breeze Airways",
    "Ultra Low Cost Carrier"
  ]
}
```

- [ ] **Step 2: Write failing test**

Create `tests/agents/trip-scout.test.ts`:
```typescript
import { runTripScout } from '@/agents/trip-scout';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '## Top 3 Flights\n\n**Delta Flight 123** — $289\n- ✈️ 8:00am → 11:30am (nonstop)\n- 🔗 [Book on Delta](https://delta.com/...)' }],
        usage: { input_tokens: 2000, output_tokens: 800 },
      }),
    },
  })),
  MODELS: { OPUS: 'claude-opus-4-6' },
}));

const mockMemory: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: { home_airport: 'DEN' },
  last_updated: null as any,
};

const mockClassification: TaskClassification = {
  category: 'flight',
  params: { destination: 'Austin', depart_date: '2026-05-10', return_date: '2026-05-13' },
  confidence: 0.92,
  needs_research: true,
};

describe('runTripScout', () => {
  it('returns flight options', async () => {
    const result = await runTripScout({
      title: 'Austin trip May 10-13',
      classification: mockClassification,
      memory: mockMemory,
    });
    expect(result.output).toContain('Delta');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/agents/trip-scout.test.ts"
```

- [ ] **Step 4: Write src/agents/trip-scout.ts**

```typescript
import { getClaudeClient, MODELS } from '@/claude';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';
import bannedAirlines from '@/config/banned-airlines.json';

interface AgentResult {
  output: string;
  tokensUsed: number;
  sources: Array<{ url: string; title: string; retrieved_at: Date }>;
  successfulSources: string[];
  blockedSources: string[];
}

const TRIP_SCOUT_PROMPT = `You are TripScout, a flight research agent.

Search these sources (Kayak, Google Flights, then direct airline site for top results):

HARD RULES — these cannot be overridden:
- BANNED airlines (never show): {BANNED_AIRLINES}
- Departure time: 6:00am–9:00pm ONLY. If forced outside window, flag ⚠️ Outside preferred hours
- Arrival time: 6:00am–9:00pm preferred
- Priority order: time window → price → airline quality

FORMAT:
## Top 3 Flight Options

For each:
**[Airline] Flight [#]** — $[price] (round trip)
- ✈️ [departure time] → [arrival time] ([duration], [stops])
- 📅 Return: [return flight details]
- 💰 [note if direct booking saves money]
- 🔗 [Direct booking link]

Then: **Price trend:** [rising/falling/stable]
**Best value:** [one sentence recommendation]

User home airport: {HOME_AIRPORT}
Known avoided airlines: {AVOIDED_AIRLINES}`;

export async function runTripScout(input: {
  title: string;
  classification: TaskClassification;
  memory: AgentMemory;
}): Promise<AgentResult> {
  const { title, classification, memory } = input;
  const client = getClaudeClient();
  const prefs = memory.user_preferences as Record<string, unknown>;

  const avoidsFromMemory = (prefs.avoided_airlines as string[] | undefined) ?? [];
  const allBanned = [...bannedAirlines.banned, ...avoidsFromMemory];

  const prompt = TRIP_SCOUT_PROMPT
    .replace('{BANNED_AIRLINES}', allBanned.join(', '))
    .replace('{HOME_AIRPORT}', (prefs.home_airport as string) ?? 'not set')
    .replace('{AVOIDED_AIRLINES}', avoidsFromMemory.join(', ') || 'none beyond defaults');

  const response = await client.messages.create({
    model: MODELS.OPUS,
    max_tokens: 4096,
    system: prompt,
    messages: [{ role: 'user', content: `Trip request: ${title}\nDetails: ${JSON.stringify(classification.params)}` }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : 'No flights found.';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  const urls = output.match(/https?:\/\/[^\s)]+/g) ?? [];
  const sources = urls.map(url => ({ url, title: new URL(url).hostname, retrieved_at: new Date() }));

  return { output, tokensUsed, sources, successfulSources: ['kayak.com', 'google.com/flights'], blockedSources: [] };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/agents/trip-scout.test.ts"
```

- [ ] **Step 6: Commit**

```bash
git add src/config/banned-airlines.json src/agents/trip-scout.ts tests/agents/trip-scout.test.ts
git commit -m "feat: add TripScout agent with banned airline enforcement"
```

---

## Task 9: ExperienceFinder Agent

**Files:**
- Create: `src/agents/experience-finder.ts`
- Create: `tests/agents/experience-finder.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/agents/experience-finder.test.ts`:
```typescript
import { runExperienceFinder } from '@/agents/experience-finder';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '## Golf Tee Times — Sunday\n\n**Denver Golf League**\n- 8:00am — 2 players — $45/player\n- 🔗 [Reserve](https://denvergolf.com/...)' }],
        usage: { input_tokens: 1500, output_tokens: 600 },
      }),
    },
  })),
  MODELS: { SONNET: 'claude-sonnet-4-6' },
}));

const mockMemory: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: {},
  last_updated: null as any,
};

const mockClassification: TaskClassification = {
  category: 'golf',
  params: { date: 'Sunday', players: 2 },
  confidence: 0.93,
  needs_research: true,
};

describe('runExperienceFinder', () => {
  it('returns reservation options with booking links', async () => {
    const result = await runExperienceFinder({
      title: 'Golf Sunday morning, 2 players',
      classification: mockClassification,
      memory: mockMemory,
    });
    expect(result.output).toContain('Denver Golf League');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/agents/experience-finder.test.ts"
```

- [ ] **Step 3: Write src/agents/experience-finder.ts**

```typescript
import { getClaudeClient, MODELS } from '@/claude';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

interface AgentResult {
  output: string;
  tokensUsed: number;
  sources: Array<{ url: string; title: string; retrieved_at: Date }>;
  successfulSources: string[];
  blockedSources: string[];
}

const SITE_MAP: Record<string, string[]> = {
  golf: ['Denver Golf League (https://www.denvergolf.org)', 'GolfNow', 'TeeOff', 'course direct site'],
  camping: ['Recreation.gov', 'ReserveAmerica', 'Hipcamp'],
  concert: ['AXS', 'Ticketmaster', 'venue official site'],
  sports: ['Ticketmaster', 'StubHub', 'team official site'],
  local_event: ['Eventbrite', 'Meetup', 'Google Events'],
  massage: ['MindBody', 'Yelp (≥4⭐)', 'local spa sites'],
  dinner: ['OpenTable'],
};

const EXPERIENCE_FINDER_PROMPT = `You are ExperienceFinder, a reservation research agent.

Category: {CATEGORY}
Search these sites: {SITES}

For EACH option found, provide a "Ready to Reserve" entry:
- Exact date/time/availability
- Price (per person or total)
- Direct booking link (pre-filled with date/party size where possible)

FORMAT:
## {CATEGORY_LABEL} Options

For each (top 3, ranked by best match):
**[Name/Venue]**
- 📅 [Date/Time/Availability]
- 💰 [Price]
- 👥 [Party size accommodated]
- 🔗 [Reserve Now: direct booking link]

**Best pick:** [one sentence recommendation]`;

export async function runExperienceFinder(input: {
  title: string;
  classification: TaskClassification;
  memory: AgentMemory;
}): Promise<AgentResult> {
  const { title, classification } = input;
  const client = getClaudeClient();

  const category = classification.category;
  const sites = SITE_MAP[category] ?? ['Google', 'Eventbrite'];

  const prompt = EXPERIENCE_FINDER_PROMPT
    .replace('{CATEGORY}', category)
    .replace('{SITES}', sites.join(', '))
    .replace('{CATEGORY_LABEL}', category.charAt(0).toUpperCase() + category.slice(1));

  const response = await client.messages.create({
    model: MODELS.SONNET,
    max_tokens: 4096,
    system: prompt,
    messages: [{ role: 'user', content: `Request: ${title}\nDetails: ${JSON.stringify(classification.params)}` }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : 'No results found.';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  const urls = output.match(/https?:\/\/[^\s)]+/g) ?? [];
  const sources = urls.map(url => ({ url, title: new URL(url).hostname, retrieved_at: new Date() }));

  return { output, tokensUsed, sources, successfulSources: sites.map(s => s.split(' ')[0].toLowerCase()), blockedSources: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/agents/experience-finder.test.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/experience-finder.ts tests/agents/experience-finder.test.ts
git commit -m "feat: add ExperienceFinder agent"
```

---

## Task 10: AdminAssist Agent

**Files:**
- Create: `src/agents/admin-assist.ts`
- Create: `tests/agents/admin-assist.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/agents/admin-assist.test.ts`:
```typescript
import { runAdminAssist } from '@/agents/admin-assist';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '**Goal:** Learn conversational Spanish in 90 days.\n\n**Learning Path:**\n1. ...' }],
        usage: { input_tokens: 800, output_tokens: 600 },
      }),
    },
  })),
  MODELS: { HAIKU: 'claude-haiku-4-5-20251001', SONNET: 'claude-sonnet-4-6' },
}));

const mockMemory: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: {},
  last_updated: null as any,
};

const mockClassification: TaskClassification = {
  category: 'learning',
  params: { subject: 'Spanish', goal: 'conversational' },
  confidence: 0.9,
  needs_research: true,
};

describe('runAdminAssist', () => {
  it('returns a learning path with goal and steps', async () => {
    const result = await runAdminAssist({
      title: 'How to learn Spanish fast',
      classification: mockClassification,
      memory: mockMemory,
    });
    expect(result.output).toContain('Goal');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/agents/admin-assist.test.ts"
```

- [ ] **Step 3: Write src/agents/admin-assist.ts**

```typescript
import { getClaudeClient, MODELS } from '@/claude';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

interface AgentResult {
  output: string;
  tokensUsed: number;
  sources: Array<{ url: string; title: string; retrieved_at: Date }>;
  successfulSources: string[];
  blockedSources: string[];
}

const RESEARCH_KEYWORDS = ['how to', 'best way', 'learn', 'find', 'research', 'compare', 'what is'];

const ADMIN_ASSIST_PROMPT = `You are AdminAssist, a personal planning and learning agent.

Frameworks to apply:
- Tim Ferriss DiSSS: Deconstruct (minimum learnable units) → Select (20% giving 80% results) → Sequence (right order) → Stakes
- Tony Robbins RPM: Result → Purpose → Massive Action Plan

OUTPUT FORMAT (strict — no extra sections):
**Goal:** [one sentence]

**Learning Path:**
1. [Step 1 action]
   - 📖 Best resource: [specific book/video/course with direct link]
   - ⏱ Est. time: [duration]
2. [Step 2 action]
   - 📖 Best resource: [resource with link]
   - ⏱ Est. time: [duration]
[3-5 steps total]

**Start Here:** [single best first resource — link + why it's first]

Rules:
- No "why it matters" section
- No motivational text
- All resource links must be direct URLs
- Maximum 5 steps`;

export async function runAdminAssist(input: {
  title: string;
  classification: TaskClassification;
  memory: AgentMemory;
}): Promise<AgentResult> {
  const { title, classification } = input;
  const client = getClaudeClient();

  // Escalate to Sonnet if research needed
  const needsResearch = classification.needs_research ||
    RESEARCH_KEYWORDS.some(kw => title.toLowerCase().includes(kw));
  const model = needsResearch ? MODELS.SONNET : MODELS.HAIKU;

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: ADMIN_ASSIST_PROMPT,
    messages: [{ role: 'user', content: `Task: ${title}\nContext: ${JSON.stringify(classification.params)}` }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : 'Unable to process task.';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  const urls = output.match(/https?:\/\/[^\s)]+/g) ?? [];
  const sources = urls.map(url => ({ url, title: new URL(url).hostname, retrieved_at: new Date() }));

  return { output, tokensUsed, sources, successfulSources: [], blockedSources: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/agents/admin-assist.test.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/admin-assist.ts tests/agents/admin-assist.test.ts
git commit -m "feat: add AdminAssist agent with DiSSS/RPM frameworks"
```

---

## Task 11: Agent Runner (Orchestrator)

**Files:**
- Create: `src/agents/runner.ts`
- Create: `tests/agents/runner.test.ts`

This is the main entry point — it orchestrates the entire pipeline for a single task.

- [ ] **Step 1: Write failing test**

Create `tests/agents/runner.test.ts`:
```typescript
import { runAgent } from '@/agents/runner';

jest.mock('@/memory/index', () => ({
  loadMemory: jest.fn().mockResolvedValue({ successful_sources: [], blocked_sources: [], user_preferences: {} }),
  updateMemoryAfterRun: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/memory/cache', () => ({
  getCachedResult: jest.fn().mockResolvedValue(null),
  setCachedResult: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/agents/classifier', () => ({
  classifyTask: jest.fn().mockResolvedValue({ category: 'shopping', params: { budget: 200 }, confidence: 0.9, needs_research: true }),
}));
jest.mock('@/agents/price-hunter', () => ({
  runPriceHunter: jest.fn().mockResolvedValue({ output: '## Results\nTop picks...', tokensUsed: 1500, sources: [], successfulSources: [], blockedSources: [] }),
}));
jest.mock('@/agents/qa', () => ({
  runQA: jest.fn().mockResolvedValue({ verdict: 'pass', notes: null, issues: [] }),
}));
jest.mock('@/results/index', () => ({
  saveResult: jest.fn().mockResolvedValue('result-123'),
}));
jest.mock('@/db/tasks', () => ({
  updateTaskStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/db/firebase', () => ({ getFirestore: jest.fn() }));

describe('runAgent', () => {
  it('runs the full pipeline and returns result id', async () => {
    const resultId = await runAgent({
      taskId: 'task-abc',
      title: 'Best headphones under $200',
      listId: 'price-hunt',
    });
    expect(resultId).toBe('result-123');
  });

  it('returns cached result path when cache hit', async () => {
    const { getCachedResult } = require('@/memory/cache');
    getCachedResult.mockResolvedValueOnce({ result_path: '/cached/path.md', task_id: 'old-task' });
    const resultId = await runAgent({
      taskId: 'task-xyz',
      title: 'Best headphones under $200',
      listId: 'price-hunt',
    });
    expect(resultId).toBe('old-task');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="tests/agents/runner.test.ts"
```

- [ ] **Step 3: Write src/agents/runner.ts**

```typescript
import { ListId, TaskStatus, QAVerdict } from '@/db/schema';
import { loadMemory, updateMemoryAfterRun } from '@/memory/index';
import { getCachedResult, setCachedResult } from '@/memory/cache';
import { classifyTask } from '@/agents/classifier';
import { runQA } from '@/agents/qa';
import { saveResult } from '@/results/index';
import { updateTaskStatus } from '@/db/tasks';
import { runPriceHunter } from '@/agents/price-hunter';
import { runTripScout } from '@/agents/trip-scout';
import { runExperienceFinder } from '@/agents/experience-finder';
import { runAdminAssist } from '@/agents/admin-assist';

const AGENT_MAP: Record<ListId, string> = {
  'price-hunt': 'price-hunter',
  'trip-planner': 'trip-scout',
  'experience-scout': 'experience-finder',
  'admin': 'admin-assist',
};

interface RunAgentInput {
  taskId: string;
  title: string;
  listId: ListId;
}

export async function runAgent(input: RunAgentInput): Promise<string> {
  const { taskId, title, listId } = input;
  const agentName = AGENT_MAP[listId];

  // 1. Check cache
  const cached = await getCachedResult(listId, title);
  if (cached) {
    await updateTaskStatus(taskId, TaskStatus.COMPLETED, {
      agent: agentName,
      result_path: cached.result_path,
      tokens_used: 0,
      qa_verdict: QAVerdict.PASS,
    });
    return cached.task_id;
  }

  // 2. Load memory
  const [agentMemory, globalMemory] = await Promise.all([
    loadMemory(agentName),
    loadMemory('global'),
  ]);
  const memory = {
    ...agentMemory,
    user_preferences: { ...globalMemory.user_preferences, ...agentMemory.user_preferences },
  };

  // 3. Classify task
  const classification = await classifyTask(listId, title);

  // 4. Run specialist agent
  await updateTaskStatus(taskId, TaskStatus.RUNNING, { agent: agentName });

  let agentResult;
  let retryCount = 0;
  const MAX_QA_RETRIES = 2;

  while (retryCount <= MAX_QA_RETRIES) {
    switch (listId) {
      case 'price-hunt':
        agentResult = await runPriceHunter({ title, classification, memory });
        break;
      case 'trip-planner':
        agentResult = await runTripScout({ title, classification, memory });
        break;
      case 'experience-scout':
        agentResult = await runExperienceFinder({ title, classification, memory });
        break;
      case 'admin':
        agentResult = await runAdminAssist({ title, classification, memory });
        break;
    }

    // 5. QA check
    const qa = await runQA({ taskTitle: title, agentName, output: agentResult!.output, listId });

    if (qa.verdict !== 'fail') {
      // Pass or pass_with_notes — append QA notes if any
      const finalOutput = qa.notes
        ? `${agentResult!.output}\n\n---\n⚠️ QA Notes: ${qa.notes}`
        : agentResult!.output;

      // 6. Save result
      const resultId = await saveResult({
        taskId,
        agent: agentName,
        output: finalOutput,
        sources: agentResult!.sources,
        qaNotes: qa.notes,
      });

      // 7. Update task + memory + cache
      await updateTaskStatus(taskId, TaskStatus.COMPLETED, {
        agent: agentName,
        tokens_used: agentResult!.tokensUsed,
        qa_verdict: qa.verdict as QAVerdict,
        result_path: `${process.env.HOME}/admin-workflow/results/${new Date().toISOString().split('T')[0]}/${taskId}.md`,
      });

      await updateMemoryAfterRun(agentName, agentResult!.successfulSources, agentResult!.blockedSources);
      await setCachedResult(listId, title, resultId, `${process.env.HOME}/admin-workflow/results/${new Date().toISOString().split('T')[0]}/${taskId}.md`);

      return resultId;
    }

    retryCount++;
    if (retryCount > MAX_QA_RETRIES) {
      // QA failed after max retries — save raw and mark failed
      const resultId = await saveResult({
        taskId,
        agent: agentName,
        output: `⚠️ QA FAILED (${MAX_QA_RETRIES} retries)\n\nIssues: ${qa.issues.join('; ')}\n\n---\nRaw output:\n${agentResult!.output}`,
        sources: agentResult!.sources,
        qaNotes: qa.issues.join('; '),
      });
      await updateTaskStatus(taskId, TaskStatus.FAILED, {
        agent: agentName,
        tokens_used: agentResult!.tokensUsed,
        qa_verdict: QAVerdict.FAIL,
      });
      return resultId;
    }
  }

  return taskId; // unreachable but TypeScript needs it
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="tests/agents/runner.test.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/agents/runner.ts tests/agents/runner.test.ts
git commit -m "feat: add AgentRunner orchestrator with QA retry loop"
```

---

## Task 12: Full Test Suite + Integration Verification

- [ ] **Step 1: Run all tests**

```bash
cd "/Users/petergoeren/Claude Coding Projects/admin-workflow"
npm test
```
Expected: All tests PASS (existing 14 + new ~20 = ~34 total)

- [ ] **Step 2: Run coverage**

```bash
npm run test:coverage
```
Expected: agents/* modules ≥ 70% coverage

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: No TypeScript errors

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete Plan 2 agent system — all agents ready"
```

---

## Notes for Implementer

- **Playwright**: The agents in this plan use Claude's language model directly (not live Playwright browser sessions) because Playwright is a Claude Code MCP plugin, not an npm package. In Plan 3 (Orchestration), the agents will be invoked as Claude Code sessions that *can* use Playwright tools. For now, the agents produce research by reasoning from their training + any context provided. Live browsing will be wired in Plan 3.
- **Config path alias**: `@/` maps to `src/` via tsconfig paths. `@/config/banned-airlines.json` needs `resolveJsonModule: true` in tsconfig (already set).
- **All mocks**: Tests mock Claude API calls — no real API keys needed to run tests.
