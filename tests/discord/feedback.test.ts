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
const mockResultQuery = { get: jest.fn().mockResolvedValue({ empty: false, docs: [{ data: () => resultData }] }) };
const mockCacheQuery = { get: jest.fn().mockResolvedValue({ docs: [{ ref: { delete: mockDelete } }] }) };
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

const mockCreate = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: '{"scope":"global","preference":"prefers budget options under $100"}' }],
});
jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({ messages: { create: mockCreate } })),
  MODELS: { HAIKU: 'claude-haiku-4-5-20251001' },
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
