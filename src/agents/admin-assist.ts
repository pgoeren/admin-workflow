import { getClaudeClient, MODELS } from '@/claude';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';

interface AgentResult {
  output: string;
  tokensUsed: number;
  sources: Array<{ url: string; title: string; retrieved_at: Date }>;
  successfulSources: string[];
  blockedSources: string[];
}

const RESEARCH_KEYWORDS = ['how to', 'best way', 'learn', 'find', 'research', 'compare', 'what is'];

const ADMIN_ASSIST_PROMPT = `You are AdminAssist, a personal planning and learning agent.

Frameworks to apply:
- Tim Ferriss DiSSS: Deconstruct (minimum learnable units) → Select (20% giving 80% results) → Sequence (right order) → Stakes
- Tony Robbins RPM: Result → Purpose → Massive Action Plan

OUTPUT FORMAT (strict — no extra sections):
**Goal:** [one sentence]

**Learning Path:**
1. [Step 1 action]
   - 📖 Best resource: [specific book/video/course with direct link]
   - ⏱ Est. time: [duration]
2. [Step 2 action]
   - 📖 Best resource: [resource with link]
   - ⏱ Est. time: [duration]
[3-5 steps total]

**Start Here:** [single best first resource — link + why it's first]

Rules:
- No "why it matters" section
- No motivational text
- All resource links must be direct URLs
- Maximum 5 steps`;

export async function runAdminAssist(input: {
  title: string;
  classification: TaskClassification;
  memory: AgentMemory;
}): Promise<AgentResult> {
  const { title, classification } = input;
  const client = getClaudeClient();

  // Escalate to Sonnet if research needed
  const needsResearch = classification.needs_research ||
    RESEARCH_KEYWORDS.some(kw => title.toLowerCase().includes(kw));
  const model = needsResearch ? MODELS.SONNET : MODELS.HAIKU;

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: ADMIN_ASSIST_PROMPT,
    messages: [{ role: 'user', content: `Task: ${title}\nContext: ${JSON.stringify(classification.params)}` }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : 'Unable to process task.';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  // Safe URL parsing
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urls = output.match(urlRegex) ?? [];
  const sources: Array<{ url: string; title: string; retrieved_at: Date }> = [];
  for (const url of urls) {
    try {
      sources.push({ url, title: new URL(url).hostname, retrieved_at: new Date() });
    } catch {
      // skip malformed URLs
    }
  }

  return {
    output,
    tokensUsed,
    sources,
    successfulSources: sources.map(s => new URL(s.url).hostname),
    blockedSources: [],
  };
}
