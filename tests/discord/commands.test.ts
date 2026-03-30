import { handleCommand } from '@/discord/commands';

const mockSet = jest.fn().mockResolvedValue(undefined);
jest.mock('@/db/firebase', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ set: mockSet })) })),
  })),
}));

describe('handleCommand', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pause agents sets heartbeat_paused to true', async () => {
    const result = await handleCommand('pause agents');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeat_paused: true }),
      { merge: true }
    );
    expect(result.response).toContain('paused');
  });

  it('resume agents sets heartbeat_paused to false', async () => {
    const result = await handleCommand('resume agents');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeat_paused: false }),
      { merge: true }
    );
    expect(result.response).toContain('resumed');
  });

  it('set morning summary to 8am sets correct cron', async () => {
    const result = await handleCommand('set morning summary to 8am');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ morning_summary_cron: '0 8 * * *' }),
      { merge: true }
    );
    expect(result.response).toContain('8am');
  });

  it('set morning summary to 7am sets correct cron', async () => {
    await handleCommand('set morning summary to 7am');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ morning_summary_cron: '0 7 * * *' }),
      { merge: true }
    );
  });

  it('is case insensitive', async () => {
    const result = await handleCommand('PAUSE AGENTS');
    expect(result.response).toContain('paused');
  });

  it('returns unknown command message for unrecognised input', async () => {
    const result = await handleCommand('do something random');
    expect(result.response).toContain('Unknown command');
    expect(mockSet).not.toHaveBeenCalled();
  });
});
