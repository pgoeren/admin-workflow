import { incrementTokenLog } from '@/token-log/index';

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn(() => ({ set: mockSet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({ collection: mockCollection })),
}));

const FIXED_DATE = '2026-03-30';
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(`${FIXED_DATE}T09:00:00Z`));
});
afterAll(() => jest.useRealTimers());

describe('incrementTokenLog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls set with merge:true on the correct document key', async () => {
    await incrementTokenLog('price-hunter', 1500);
    expect(mockCollection).toHaveBeenCalledWith('token_log');
    expect(mockDoc).toHaveBeenCalledWith(`${FIXED_DATE}_price-hunter`);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ date: FIXED_DATE, agent: 'price-hunter' }),
      { merge: true }
    );
  });

  it('passes FieldValue.increment for total_tokens and run_count', async () => {
    await incrementTokenLog('trip-scout', 800);
    const callArg = mockSet.mock.calls[0][0];
    expect(typeof callArg.total_tokens).not.toBe('number');
    expect(typeof callArg.run_count).not.toBe('number');
  });
});
