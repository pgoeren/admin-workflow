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
