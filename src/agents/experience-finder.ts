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

const SITE_MAP: Record<string, string[]> = {
  golf: ['Denver Golf League (https://www.denvergolf.org)', 'GolfNow', 'TeeOff', 'course direct site'],
  camping: ['Recreation.gov', 'ReserveAmerica', 'Hipcamp'],
  concert: ['AXS', 'Ticketmaster', 'venue official site'],
  sports: ['Ticketmaster', 'StubHub', 'team official site'],
  local_event: ['Eventbrite', 'Meetup', 'Google Events'],
  massage: ['MindBody', 'Yelp (≥4⭐)', 'local spa sites'],
  dinner: ['OpenTable'],
};

const EXPERIENCE_FINDER_PROMPT = `You are ExperienceFinder, a reservation research agent.

Category: {CATEGORY}
Search these sites: {SITES}

For EACH option found, provide a "Ready to Reserve" entry:
- Exact date/time/availability
- Price (per person or total)
- Direct booking link (pre-filled with date/party size where possible)

FORMAT:
## {CATEGORY_LABEL} Options

For each (top 3, ranked by best match):
**[Name/Venue]**
- 📅 [Date/Time/Availability]
- 💰 [Price]
- 👥 [Party size accommodated]
- 🔗 [Reserve Now: direct booking link]

**Best pick:** [one sentence recommendation]`;

export async function runExperienceFinder(input: {
  title: string;
  classification: TaskClassification;
  memory: AgentMemory;
}): Promise<AgentResult> {
  const { title, classification } = input;
  const client = getClaudeClient();

  const category = classification.category;
  const sites = SITE_MAP[category] ?? ['Google', 'Eventbrite'];

  const prompt = EXPERIENCE_FINDER_PROMPT
    .replace('{CATEGORY}', category)
    .replace('{SITES}', sites.join(', '))
    .replace('{CATEGORY_LABEL}', category.charAt(0).toUpperCase() + category.slice(1));

  const response = await client.messages.create({
    model: MODELS.SONNET,
    max_tokens: 4096,
    system: prompt,
    messages: [{ role: 'user', content: `Request: ${title}\nDetails: ${JSON.stringify(classification.params)}` }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : 'No results found.';
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
