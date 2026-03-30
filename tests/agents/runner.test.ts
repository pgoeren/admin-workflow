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
jest.mock('@/token-log/index', () => ({
  incrementTokenLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/agents/trip-scout', () => ({
  runTripScout: jest.fn().mockResolvedValue({ output: 'flights...', tokensUsed: 500, sources: [], successfulSources: [], blockedSources: [] }),
}));
jest.mock('@/agents/experience-finder', () => ({
  runExperienceFinder: jest.fn().mockResolvedValue({ output: 'events...', tokensUsed: 500, sources: [], successfulSources: [], blockedSources: [] }),
}));
jest.mock('@/agents/admin-assist', () => ({
  runAdminAssist: jest.fn().mockResolvedValue({ output: '**Goal:** Learn Spanish...', tokensUsed: 500, sources: [], successfulSources: [], blockedSources: [] }),
}));

describe('runAgent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs the full pipeline and returns result id', async () => {
    const resultId = await runAgent({
      taskId: 'task-abc',
      title: 'Best headphones under $200',
      listId: 'price-hunt',
    });
    expect(resultId).toBe('result-123');
  });

  it('calls incrementTokenLog with agent name and tokens used', async () => {
    const { incrementTokenLog } = require('@/token-log/index');
    await runAgent({ taskId: 'task-abc', title: 'Best headphones under $200', listId: 'price-hunt' });
    expect(incrementTokenLog).toHaveBeenCalledWith('price-hunter', 1500);
  });

  it('returns cached result task_id when cache hit', async () => {
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
