import { runPriceHunter } from '@/agents/price-hunter';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '## Top Picks\n\n1. Sony WF-1000XM5 - $179, 4.6⭐, 12,350 reviews, free returns [Buy](https://amazon.com/...)' }],
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
    },
  })),
  MODELS: { SONNET: 'claude-sonnet-4-6' },
}));

const mockMemory: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: {},
  last_updated: null as any,
};

const mockClassification: TaskClassification = {
  category: 'shopping',
  params: { budget: 200, keywords: ['headphones', 'noise-canceling'] },
  confidence: 0.95,
  needs_research: true,
};

describe('runPriceHunter', () => {
  it('returns output string and token usage', async () => {
    const result = await runPriceHunter({
      title: 'Best noise-canceling headphones under $200',
      classification: mockClassification,
      memory: mockMemory,
    });
    expect(result.output).toContain('Sony');
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.sources).toBeInstanceOf(Array);
  });
});
