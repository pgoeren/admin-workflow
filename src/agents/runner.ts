import { ListId, TaskStatus, QAVerdict } from '@/db/schema';
import { loadMemory, updateMemoryAfterRun } from '@/memory/index';
import { getCachedResult, setCachedResult } from '@/memory/cache';
import { classifyTask } from '@/agents/classifier';
import { runQA } from '@/agents/qa';
import { saveResult } from '@/results/index';
import { updateTaskStatus } from '@/db/tasks';
import { runPriceHunter } from '@/agents/price-hunter';
import { runTripScout } from '@/agents/trip-scout';
import { runExperienceFinder } from '@/agents/experience-finder';
import { runAdminAssist } from '@/agents/admin-assist';

const AGENT_MAP: Record<ListId, string> = {
  'price-hunt': 'price-hunter',
  'trip-planner': 'trip-scout',
  'experience-scout': 'experience-finder',
  'admin': 'admin-assist',
};

interface RunAgentInput {
  taskId: string;
  title: string;
  listId: ListId;
}

interface AgentRunResult {
  output: string;
  tokensUsed: number;
  sources: Array<{ url: string; title: string; retrieved_at: Date }>;
  successfulSources: string[];
  blockedSources: string[];
}

export async function runAgent(input: RunAgentInput): Promise<string> {
  const { taskId, title, listId } = input;
  const agentName = AGENT_MAP[listId];

  // 1. Check cache
  const cached = await getCachedResult(listId, title);
  if (cached) {
    await updateTaskStatus(taskId, TaskStatus.COMPLETED, {
      agent: agentName,
      result_path: cached.result_path,
      tokens_used: 0,
      qa_verdict: QAVerdict.PASS,
    });
    return cached.task_id;
  }

  // 2. Load memory
  const [agentMemory, globalMemory] = await Promise.all([
    loadMemory(agentName),
    loadMemory('global'),
  ]);
  const memory = {
    ...agentMemory,
    user_preferences: { ...globalMemory.user_preferences, ...agentMemory.user_preferences },
  };

  // 3. Classify task
  const classification = await classifyTask(listId, title);

  // 4. Run specialist agent + QA loop
  await updateTaskStatus(taskId, TaskStatus.RUNNING, { agent: agentName });

  let agentResult: AgentRunResult | undefined;
  const MAX_QA_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_QA_RETRIES; attempt++) {
    switch (listId) {
      case 'price-hunt':
        agentResult = await runPriceHunter({ title, classification, memory });
        break;
      case 'trip-planner':
        agentResult = await runTripScout({ title, classification, memory });
        break;
      case 'experience-scout':
        agentResult = await runExperienceFinder({ title, classification, memory });
        break;
      case 'admin':
        agentResult = await runAdminAssist({ title, classification, memory });
        break;
    }

    // 5. QA check
    const qa = await runQA({ taskTitle: title, agentName, output: agentResult!.output, listId });

    if (qa.verdict !== 'fail') {
      const finalOutput = qa.notes
        ? `${agentResult!.output}\n\n---\n⚠️ QA Notes: ${qa.notes}`
        : agentResult!.output;

      // 6. Save result
      const resultId = await saveResult({
        taskId,
        agent: agentName,
        output: finalOutput,
        sources: agentResult!.sources,
        qaNotes: qa.notes,
      });

      // 7. Update task + memory + cache
      const resultPath = `${process.env.HOME ?? '/tmp'}/admin-workflow/results/${new Date().toISOString().split('T')[0]}/${taskId}.md`;
      await updateTaskStatus(taskId, TaskStatus.COMPLETED, {
        agent: agentName,
        tokens_used: agentResult!.tokensUsed,
        qa_verdict: qa.verdict as QAVerdict,
        result_path: resultPath,
      });
      await updateMemoryAfterRun(agentName, agentResult!.successfulSources, agentResult!.blockedSources);
      await setCachedResult(listId, title, resultId, resultPath);

      return resultId;
    }

    // QA failed — retry unless at max
    if (attempt >= MAX_QA_RETRIES) {
      const resultId = await saveResult({
        taskId,
        agent: agentName,
        output: `⚠️ QA FAILED (${MAX_QA_RETRIES} retries)\n\nIssues: ${qa.issues.join('; ')}\n\n---\nRaw output:\n${agentResult!.output}`,
        sources: agentResult!.sources,
        qaNotes: qa.issues.join('; '),
      });
      await updateTaskStatus(taskId, TaskStatus.FAILED, {
        agent: agentName,
        tokens_used: agentResult!.tokensUsed,
        qa_verdict: QAVerdict.FAIL,
      });
      return resultId;
    }
    // else loop continues for next attempt
  }

  return taskId; // unreachable
}
