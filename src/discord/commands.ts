import { getFirestore } from '@/db/firebase';

interface CommandResult {
  response: string;
}

const UNKNOWN_RESPONSE = 'Unknown command. Available: pause agents, resume agents, set morning summary to Xam';

export async function handleCommand(text: string): Promise<CommandResult> {
  const normalised = text.trim().toLowerCase();
  const db = getFirestore();
  const ref = db.collection('config').doc('system');

  if (normalised === 'pause agents') {
    await ref.set({ heartbeat_paused: true }, { merge: true });
    return { response: 'Agents paused. No tasks will be processed until resumed.' };
  }

  if (normalised === 'resume agents') {
    await ref.set({ heartbeat_paused: false }, { merge: true });
    return { response: 'Agents resumed. Heartbeat will process tasks normally.' };
  }

  const morningMatch = normalised.match(/^set morning summary to (\d{1,2})am$/);
  if (morningMatch) {
    const hour = parseInt(morningMatch[1], 10);
    if (hour >= 1 && hour <= 12) {
      await ref.set({ morning_summary_cron: `0 ${hour} * * *` }, { merge: true });
      return { response: `Morning summary scheduled for ${hour}am daily.` };
    }
  }

  return { response: UNKNOWN_RESPONSE };
}
