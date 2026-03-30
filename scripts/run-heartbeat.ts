import { processHeartbeat } from '../src/heartbeat/index';

async function main() {
  try {
    const result = await processHeartbeat();
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Heartbeat error: ${err}\n`);
    process.exit(1);
  }
}

main();
