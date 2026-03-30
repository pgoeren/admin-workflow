import { getClaudeClient, MODELS } from '@/claude';
import { ListId } from '@/db/schema';

export interface QAResult {
  verdict: 'pass' | 'pass_with_notes' | 'fail';
  notes: string | null;
  issues: string[];
}

const QA_SYSTEM_PROMPT = `You are a QA reviewer for research results from an admin workflow agent.

Review the agent output and check:
1. Does it actually answer the task? (results match what was requested)
2. Are sources linked? (direct URLs, not just domain names)
3. Are there duplicates?
4. Agent-specific checks:
   - price-hunter: ratings ≥4.0⭐, ≥50 reviews shown, return policy mentioned
   - trip-scout: no budget airlines (Spirit/Frontier/Allegiant/Sun Country/Avelo/Breeze), departure/arrival times within 6am-9pm
   - experience-finder: valid dates/availability shown, booking links present
   - admin-assist: content links resolve (not broken URLs), steps are ordered

Return ONLY valid JSON:
{
  "verdict": "pass" | "pass_with_notes" | "fail",
  "notes": "string explaining pass_with_notes issues, or null",
  "issues": ["list of specific failures for fail verdict, empty otherwise"]
}

Be generous with pass — only fail if results clearly don't answer the task or violate hard rules.`;

export async function runQA(input: {
  taskTitle: string;
  agentName: string;
  output: string;
  listId: ListId;
}): Promise<QAResult> {
  const client = getClaudeClient();
  const response = await client.messages.create({
    model: MODELS.HAIKU,
    max_tokens: 1024,
    system: QA_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Task: ${input.taskTitle}\nAgent: ${input.agentName}\nList: ${input.listId}\n\n---OUTPUT---\n${input.output}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    return JSON.parse(text) as QAResult;
  } catch {
    return { verdict: 'pass_with_notes', notes: 'QA parse error — output delivered unverified', issues: [] };
  }
}
