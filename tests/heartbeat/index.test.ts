import { claimNextTask, processHeartbeat, releaseHeartbeatLock } from '@/heartbeat/index';
import { TaskStatus, QAVerdict } from '@/db/schema';

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

const mockRunTransaction = jest.fn();
let mockDb: any;

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
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      collection: jest.fn(() => ({ doc: jest.fn(() => mockTaskDocRef) })),
      runTransaction: mockRunTransaction,
    };
  });

  it('sets heartbeat_lock to null on the task document', async () => {
    await releaseHeartbeatLock('task-001');
    expect(mockUpdate).toHaveBeenCalledWith({ heartbeat_lock: null });
  });
});

describe('claimNextTask', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when no pending/queued tasks exist', async () => {
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    mockDb = {
      collection: jest.fn(() => mockQuery),
      runTransaction: mockRunTransaction,
    };
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
    mockDb = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => mockConfigDoc),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      })),
      runTransaction: mockRunTransaction,
    };
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
    mockDb = {
      collection: jest.fn((name: string) => {
        if (name === 'config') return { doc: jest.fn(() => mockConfigDoc) };
        return mockQuery;
      }),
      runTransaction: jest.fn(),
    };
    const result = await processHeartbeat();
    expect(result).toBeNull();
  });
});
