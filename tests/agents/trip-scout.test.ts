import { runTripScout } from '@/agents/trip-scout';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '## Top 3 Flights\n\n**Delta Flight 123** — $289\n- ✈️ 8:00am → 11:30am (nonstop)\n- 🔗 [Book on Delta](https://delta.com/...)' }],
        usage: { input_tokens: 2000, output_tokens: 800 },
      }),
    },
  })),
  MODELS: { OPUS: 'claude-opus-4-6' },
}));

const mockMemory: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: { home_airport: 'DEN' },
  last_updated: null as any,
};

const mockClassification: TaskClassification = {
  category: 'flight',
  params: { destination: 'Austin', depart_date: '2026-05-10', return_date: '2026-05-13' },
  confidence: 0.92,
  needs_research: true,
};

describe('runTripScout', () => {
  it('returns flight options', async () => {
    const result = await runTripScout({
      title: 'Austin trip May 10-13',
      classification: mockClassification,
      memory: mockMemory,
    });
    expect(result.output).toContain('Delta');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});
