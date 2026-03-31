import { generateMorningSummary } from '../src/discord/morning-summary';
import { postToDiscord } from '../src/discord/delivery';

async function main() {
  try {
    const message = await generateMorningSummary();
    process.stdout.write(message + '\n');
    await postToDiscord(message);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Morning summary error: ${err}\n`);
    await postToDiscord('⚠️ Morning summary error — check logs').catch(() => {});
    process.exit(1);
  }
}

main();
