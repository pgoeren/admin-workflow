import { processHeartbeat } from '../src/heartbeat/index';
import { postToDiscord } from '../src/discord/delivery';

async function main() {
  try {
    const result = await processHeartbeat();
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result?.discordMessage) {
      await postToDiscord(result.discordMessage);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Heartbeat error: ${err}\n`);
    await postToDiscord('⚠️ Heartbeat error — check logs').catch(() => {});
    process.exit(1);
  }
}

main();
