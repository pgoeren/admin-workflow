import { getClaudeClient, MODELS } from '@/claude';
import { TaskClassification } from '@/agents/classifier';
import { AgentMemory } from '@/db/schema';
import bannedAirlines from '@/config/banned-airlines.json';

interface AgentResult {
  output: string;
  tokensUsed: number;
  sources: Array<{ url: string; title: string; retrieved_at: Date }>;
  successfulSources: string[];
  blockedSources: string[];
}

const TRIP_SCOUT_PROMPT = `You are TripScout, a flight research agent.

Search these sources (Kayak, Google Flights, then direct airline site for top results):

HARD RULES — these cannot be overridden:
- BANNED airlines (never show): {BANNED_AIRLINES}
- Departure time: 6:00am–9:00pm ONLY. If forced outside window, flag ⚠️ Outside preferred hours
- Arrival time: 6:00am–9:00pm preferred
- Priority order: time window → price → airline quality

FORMAT:
## Top 3 Flight Options

For each:
**[Airline] Flight [#]** — $[price] (round trip)
- ✈️ [departure time] → [arrival time] ([duration], [stops])
- 📅 Return: [return flight details]
- 💰 [note if direct booking saves money]
- 🔗 [Direct booking link]

Then: **Price trend:** [rising/falling/stable]
**Best value:** [one sentence recommendation]

User home airport: {HOME_AIRPORT}
Known avoided airlines: {AVOIDED_AIRLINES}`;

export async function runTripScout(input: {
  title: string;
  classification: TaskClassification;
  memory: AgentMemory;
}): Promise<AgentResult> {
  const { title, classification, memory } = input;
  const client = getClaudeClient();
  const prefs = memory.user_preferences as Record<string, unknown>;

  const avoidsFromMemory = (prefs.avoided_airlines as string[] | undefined) ?? [];
  const allBanned = [...bannedAirlines.banned, ...avoidsFromMemory];

  const prompt = TRIP_SCOUT_PROMPT
    .replace('{BANNED_AIRLINES}', allBanned.join(', '))
    .replace('{HOME_AIRPORT}', (prefs.home_airport as string) ?? 'not set')
    .replace('{AVOIDED_AIRLINES}', avoidsFromMemory.join(', ') || 'none beyond defaults');

  const response = await client.messages.create({
    model: MODELS.OPUS,
    max_tokens: 4096,
    system: prompt,
    messages: [{ role: 'user', content: `Trip request: ${title}\nDetails: ${JSON.stringify(classification.params)}` }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : 'No flights found.';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  // Safe URL parsing (same pattern as PriceHunter)
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
