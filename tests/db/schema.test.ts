import { TaskStatus, QAVerdict, Task, Result, AgentMemory, CacheEntry, TokenLog } from '@/db/schema';

describe('schema types', () => {
  it('TaskStatus enum contains all valid statuses', () => {
    expect(TaskStatus.PENDING).toBe('pending');
    expect(TaskStatus.RUNNING).toBe('running');
    expect(TaskStatus.QUEUED).toBe('queued');
    expect(TaskStatus.COMPLETED).toBe('completed');
    expect(TaskStatus.FAILED).toBe('failed');
  });

  it('QAVerdict enum contains all valid verdicts', () => {
    expect(QAVerdict.PASS).toBe('pass');
    expect(QAVerdict.PASS_WITH_NOTES).toBe('pass_with_notes');
    expect(QAVerdict.FAIL).toBe('fail');
  });
});
