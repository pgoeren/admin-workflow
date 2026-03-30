import { runQA, QAResult } from '@/agents/qa';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          verdict: 'pass',
          notes: null,
          issues: [],
        }) }],
      }),
    },
  })),
  MODELS: { HAIKU: 'claude-haiku-4-5-20251001' },
}));

describe('runQA', () => {
  it('returns pass verdict for valid output', async () => {
    const result = await runQA({
      taskTitle: 'Best headphones under $200',
      agentName: 'price-hunter',
      output: '## Top Picks\n\n1. Sony WF-1000XM5 - $179, 4.6⭐, 12,000 reviews, free returns\n[Buy on Amazon](https://amazon.com/...',
      listId: 'price-hunt',
    });
    expect(result.verdict).toBe('pass');
    expect(result.issues).toHaveLength(0);
  });
});
