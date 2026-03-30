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

jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: mockTasks.map(t => ({ id: t.id, data: () => t })),
      }),
    })),
  })),
}));

describe('generateMorningSummary', () => {
  it('includes the date in the header', async () => {
    expect(await generateMorningSummary()).toContain(FIXED_DATE);
  });
  it('counts completed tasks correctly', async () => {
    expect(await generateMorningSummary()).toContain('Completed: 2');
  });
  it('counts failed tasks correctly', async () => {
    expect(await generateMorningSummary()).toContain('Failed: 1');
  });
  it('counts pending tasks correctly', async () => {
    expect(await generateMorningSummary()).toContain('Pending: 1');
  });
  it('lists completed task titles', async () => {
    expect(await generateMorningSummary()).toContain('Find best coffee maker');
  });
  it('includes a motivational quote', async () => {
    expect(await generateMorningSummary()).toMatch(/💬 ".+"/);
  });
  it('stays within 2000 characters', async () => {
    expect((await generateMorningSummary()).length).toBeLessThanOrEqual(2000);
  });
});
