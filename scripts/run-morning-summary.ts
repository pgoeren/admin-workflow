import { generateMorningSummary } from '../src/discord/morning-summary';

async function main() {
  try {
    const message = await generateMorningSummary();
    process.stdout.write(message + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Morning summary error: ${err}\n`);
    process.exit(1);
  }
}

main();
