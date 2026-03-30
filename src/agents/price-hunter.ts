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

const PRICE_HUNTER_PROMPT = `You are PriceHunter, a product research agent. You use web browsing to find the best value products.

Research the requested product across these sites (in parallel if possible):
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

  const prompt = PRICE_HUNTER_PROMPT
    .replace('{BLOCKED_SOURCES}', memory.blocked_sources.join(', ') || 'none')
    .replace('{USER_PREFERENCES}', JSON.stringify(memory.user_preferences));

  const userMessage = `Product to research: ${title}
${classification.params.budget ? `Budget: $${classification.params.budget}` : ''}
${classification.params.keywords ? `Keywords: ${(classification.params.keywords as string[]).join(', ')}` : ''}

Please search the specified sites and return top 3 results meeting the quality requirements.`;

  const response = await client.messages.create({
    model: MODELS.SONNET,
    max_tokens: 4096,
    system: prompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : 'No results found.';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  // Extract source URLs from output (simple regex)
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urls = output.match(urlRegex) ?? [];
  const sources = urls.map(url => ({
    url,
    title: new URL(url).hostname,
    retrieved_at: new Date(),
  }));

  return {
    output,
    tokensUsed,
    sources,
    successfulSources: ['amazon.com', 'woot.com'],
    blockedSources: [],
  };
}
