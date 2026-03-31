import Anthropic from '@anthropic-ai/sdk';
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

const PRICE_HUNTER_PROMPT = `You are PriceHunter, a product research agent. Use the web_search tool to find the best value products.

Research the requested product across these sites:
1. Amazon — filter: ≥4.0 stars, ≥50 reviews REQUIRED
2. Brand's official website (if identifiable from the product)
3. Etsy (if the item could be artisan/unique)
4. Woot.com (check for deals)
5. One category wildcard: B&H Photo for electronics, REI for outdoor gear, Chewy for pet products, etc.

HARD REQUIREMENTS (apply to all results):
- Minimum 4.0 stars on Amazon
- Minimum 50 reviews on Amazon
- Return policy MUST be shown for every result — flag ⚠️ if <30 days or no returns, ✅ if free/easy returns
- Skip sites in the blocked_sources memory list

FORMAT your response as:
## Top 3 Picks

For each result:
**[Product Name]** — $[price]
- ⭐ [rating] ([count] reviews)
- 🔄 Returns: [policy]
- 🏪 [Seller/Site]
- [Direct purchase link]

Then: **Recommendation:** [one sentence explaining best value choice]
**Price spread:** lowest vs highest among results

Blocked sources to skip: {BLOCKED_SOURCES}
User preferences: {USER_PREFERENCES}`;

export async function runPriceHunter(input: {
  title: string;
  classification: TaskClassification;
  memory: AgentMemory;
}): Promise<AgentResult> {
  const { title, classification, memory } = input;
  const client = getClaudeClient();

  const systemPrompt = PRICE_HUNTER_PROMPT
    .replace('{BLOCKED_SOURCES}', memory.blocked_sources.join(', ') || 'none')
    .replace('{USER_PREFERENCES}', JSON.stringify(memory.user_preferences));

  const userMessage = `Product to research: ${title}
${classification.params.budget ? `Budget: $${classification.params.budget}` : ''}
${classification.params.keywords ? `Keywords: ${(classification.params.keywords as string[]).join(', ')}` : ''}

Search the web and return top 3 results meeting the quality requirements.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  const tools: Anthropic.Beta.BetaTool[] = [
    { type: 'web_search_20250305' as any, name: 'web_search' } as any,
  ];

  let output = '';
  let totalTokens = 0;
  const sources: Array<{ url: string; title: string; retrieved_at: Date }> = [];

  // Agentic loop — keep going until end_turn
  while (true) {
    const response = await (client as any).beta.messages.create({
      model: MODELS.SONNET,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    totalTokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    // Collect text output and web search results
    for (const block of response.content) {
      if (block.type === 'text') {
        output += block.text;
      } else if (block.type === 'web_search_tool_result') {
        const results = Array.isArray(block.content) ? block.content : [];
        for (const result of results) {
          if (result.type === 'web_search_result' && result.url) {
            sources.push({
              url: result.url,
              title: result.title ?? result.url,
              retrieved_at: new Date(),
            });
          }
        }
      }
    }

    if (response.stop_reason === 'end_turn') break;

    // Continue the loop with the assistant's response
    messages.push({ role: 'assistant', content: response.content });
  }

  const successfulSources = sources.map(s => {
    try { return new URL(s.url).hostname; } catch { return ''; }
  }).filter(Boolean);

  return {
    output: output || 'No results found.',
    tokensUsed: totalTokens,
    sources,
    successfulSources,
    blockedSources: memory.blocked_sources.filter(blocked =>
      sources.some(s => s.url.includes(blocked))
    ),
  };
}
