import dotenv from 'dotenv';
dotenv.config();

function require_env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  webhookSecret: require_env('WEBHOOK_SECRET'),
  firebase: {
    projectId: require_env('FIREBASE_PROJECT_ID'),
    clientEmail: require_env('FIREBASE_CLIENT_EMAIL'),
    privateKey: require_env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  },
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN ?? '',
    channelId: process.env.DISCORD_CHANNEL_ID ?? '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  },
  resultsDir: process.env.RESULTS_DIR ?? `${process.env.HOME}/admin-workflow/results`,
};

export default config;
