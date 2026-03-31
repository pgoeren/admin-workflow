import { QAVerdict } from '@/db/schema';
import config from '@/config';

export async function postToDiscord(message: string): Promise<void> {
  const webhookUrl = config.discord.webhookUrl;
  if (!webhookUrl) return; // silently skip if not configured

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  }
}

interface FormatResultParams {
  title: string;
  agentName: string;
  qaVerdict: QAVerdict;
  output: string;
  sources: Array<{ url: string; title: string }>;
}

const MAX_LENGTH = 2000;

export function formatResultMessage(params: FormatResultParams): string {
  const { title, agentName, qaVerdict, output, sources } = params;

  const header = `**${title}** — ${agentName} | QA: ${qaVerdict}\n\n`;

  const sourcesSection =
    sources.length > 0
      ? `\n\nSources:\n${sources.map(s => `• [${s.title}](${s.url})`).join('\n')}`
      : '';

  const available = MAX_LENGTH - header.length - sourcesSection.length;

  let body: string;
  if (output.length <= available) {
    body = output;
  } else {
    const truncMarker = '…[truncated]';
    body = output.slice(0, available - truncMarker.length) + truncMarker;
  }

  const full = header + body + sourcesSection;
  if (full.length <= MAX_LENGTH) return full;

  // Trim sources one by one until it fits
  let trimmedSources = [...sources];
  while (trimmedSources.length > 0) {
    trimmedSources = trimmedSources.slice(0, -1);
    const trimmedSourcesSection =
      trimmedSources.length > 0
        ? `\n\nSources:\n${trimmedSources.map(s => `• [${s.title}](${s.url})`).join('\n')}`
        : '';
    const candidate = header + body + trimmedSourcesSection;
    if (candidate.length <= MAX_LENGTH) return candidate;
  }

  return (header + body).slice(0, MAX_LENGTH);
}
