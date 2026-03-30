import { runExperienceFinder } from '@/agents/experience-finder';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '## Golf Tee Times — Sunday\n\n**Denver Golf League**\n- 8:00am — 2 players — $45/player\n- 🔗 [Reserve](https://denvergolf.com/...)' }],
        usage: { input_tokens: 1500, output_tokens: 600 },
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
  category: 'golf',
  params: { date: 'Sunday', players: 2 },
  confidence: 0.93,
  needs_research: true,
};

describe('runExperienceFinder', () => {
  it('returns reservation options with booking links', async () => {
    const result = await runExperienceFinder({
      title: 'Golf Sunday morning, 2 players',
      classification: mockClassification,
      memory: mockMemory,
    });
    expect(result.output).toContain('Denver Golf League');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});
