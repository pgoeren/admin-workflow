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
