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

const PRICE_HUNTER_PROMPT = `You are PriceHunter, a product research agent. You MUST use the web_search tool to find real, current prices before responding. Never answer from memory alone.

SEARCH STRATEGY:
1. Search Amazon first — require ≥4.0 stars AND ≥50 reviews
2. Search the brand's official website
3. Search Woot.com for deals
4. Search one category wildcard: B&H Photo (electronics), REI (outdoor), Chewy (pets), etc.

HARD REQUIREMENTS for every result:
- ≥4.0 stars, ≥50 reviews on Amazon (skip if not met)
- Show return policy — ✅ if free/easy ≥30 days, ⚠️ if restrictive
- Real current price from web search (no guessing)
- Skip sites in the blocked_sources list

REQUIRED OUTPUT FORMAT — follow exactly:

## 🏆 Top 3 Picks for [product]

**#1: [Product Name]** — $[price]
- ⭐ [rating] ([count] reviews)
- 🔄 Returns: [policy with ✅ or ⚠️]
- 🏪 [Site]
- 🔗 [direct link]
- **Why this pick:** [2-3 sentences explaining why this meets the standards — cite star rating, review count, price-to-value, return policy]

**#2: [Product Name]** — $[price]
[same format]

**#3: [Product Name]** — $[price]
[same format]

---
**🥇 Best Overall:** [Product Name] — [2-3 sentence explanation of why this is the best choice, comparing it to the others on value, quality signals, and return policy]

**💰 Price spread:** $[lowest] – $[highest]

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
