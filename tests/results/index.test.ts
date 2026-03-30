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
