import { getClaudeClient, MODELS } from '@/claude';
import { ListId } from '@/db/schema';

export interface TaskClassification {
  category: string;       // 'shopping' | 'flight' | 'golf' | 'camping' | 'concert' | 'sports' | 'local_event' | 'massage' | 'dinner' | 'learning' | 'organization' | 'unknown'
  params: Record<string, unknown>; // extracted: budget, dates, location, party_size, keywords, etc.
  confidence: number;     // 0-1
  needs_research: boolean; // whether web research is needed (vs. pure organization)
}

const CLASSIFIER_SYSTEM_PROMPT = `You are a task classifier for a personal admin workflow system.

Given a reminder title and its list category, extract:
1. category: the specific type of task
2. params: key parameters (budget as number, dates as strings, location, party_size as number, keywords array, etc.)
3. confidence: how confident you are (0-1)
4. needs_research: whether this task requires web research

Valid categories by list:
- price-hunt: "shopping"
- trip-planner: "flight", "hotel", "car_rental", "travel"
- experience-scout: "golf", "camping", "concert", "sports", "local_event", "massage", "dinner"
- admin: "learning", "organization", "research", "planning"

Respond with ONLY valid JSON matching the TaskClassification interface. No explanation.`;

export async function classifyTask(listId: ListId, title: string): Promise<TaskClassification> {
  const client = getClaudeClient();
  const response = await client.messages.create({
    model: MODELS.HAIKU,
    max_tokens: 512,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `List: ${listId}\nTitle: ${title}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    return JSON.parse(text) as TaskClassification;
  } catch {
    return {
      category: 'unknown',
      params: {},
      confidence: 0,
      needs_research: true,
    };
  }
}
