import express from 'express';
import cron from 'node-cron';
import { webhookRouter } from '@/server/webhook';
import { processHeartbeat } from '@/heartbeat/index';
import { generateMorningSummary } from '@/discord/morning-summary';
import { postToDiscord } from '@/discord/delivery';
import config from '@/config';

const app = express();
app.use(express.json());
app.use('/trigger', webhookRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = app.listen(config.port, () => {
  console.log(`Admin workflow server running on port ${config.port}`);
});

// Heartbeat every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  try {
    const result = await processHeartbeat();
    if (result?.discordMessage) {
      await postToDiscord(result.discordMessage);
    }
  } catch (err) {
    console.error('Heartbeat error:', err);
    await postToDiscord('⚠️ Heartbeat error — check logs').catch(() => {});
  }
});

// Morning summary at 7:03am MST (14:03 UTC) daily
cron.schedule('3 14 * * *', async () => {
  try {
    const message = await generateMorningSummary();
    await postToDiscord(message);
  } catch (err) {
    console.error('Morning summary error:', err);
    await postToDiscord('⚠️ Morning summary error — check logs').catch(() => {});
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});

export { app };
