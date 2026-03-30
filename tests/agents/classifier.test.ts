import { classifyTask, TaskClassification } from '@/agents/classifier';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          category: 'shopping',
          params: { budget: 200, keywords: ['headphones', 'noise-canceling'] },
          confidence: 0.95,
          needs_research: true,
        }) }],
      }),
    },
  })),
  MODELS: { HAIKU: 'claude-haiku-4-5-20251001' },
}));

describe('classifyTask', () => {
  it('classifies a shopping task and extracts params', async () => {
    const result = await classifyTask('price-hunt', 'Best noise-canceling headphones under $200');
    expect(result.category).toBe('shopping');
    expect(result.params.budget).toBe(200);
    expect(result.needs_research).toBe(true);
  });
});
