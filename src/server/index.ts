import express from 'express';
import { webhookRouter } from '@/server/webhook';
import config from '@/config';

const app = express();
app.use(express.json());
app.use('/trigger', webhookRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = app.listen(config.port, () => {
  console.log(`Admin workflow server running on port ${config.port}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});

export { app };
