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
