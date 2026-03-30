import { runAdminAssist } from '@/agents/admin-assist';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

jest.mock('@/claude', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '**Goal:** Learn conversational Spanish in 90 days.\n\n**Learning Path:**\n1. ...' }],
        usage: { input_tokens: 800, output_tokens: 600 },
      }),
    },
  })),
  MODELS: { HAIKU: 'claude-haiku-4-5-20251001', SONNET: 'claude-sonnet-4-6' },
}));

const mockMemory: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: {},
  last_updated: null as any,
};

const mockClassification: TaskClassification = {
  category: 'learning',
  params: { subject: 'Spanish', goal: 'conversational' },
  confidence: 0.9,
  needs_research: true,
};

describe('runAdminAssist', () => {
  it('returns a learning path with goal and steps', async () => {
    const result = await runAdminAssist({
      title: 'How to learn Spanish fast',
      classification: mockClassification,
      memory: mockMemory,
    });
    expect(result.output).toContain('Goal');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});
