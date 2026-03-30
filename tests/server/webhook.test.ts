import request from 'supertest';
import express from 'express';
import { webhookRouter } from '@/server/webhook';

jest.mock('@/db/tasks', () => ({ createTask: jest.fn().mockResolvedValue('task-abc') }));
jest.mock('@/db/firebase', () => ({ getFirestore: jest.fn() }));

const app = express();
app.use(express.json());
app.use('/trigger', webhookRouter);

const VALID_SECRET = 'test-secret-that-is-long-enough-ok';
process.env.WEBHOOK_SECRET = VALID_SECRET;
process.env.FIREBASE_PROJECT_ID = 'test';
process.env.FIREBASE_CLIENT_EMAIL = 'x@x.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = 'key';

describe('POST /trigger', () => {
  it('returns 200 with task_id for valid payload', async () => {
    const res = await request(app)
      .post('/trigger')
      .set('Authorization', `Bearer ${VALID_SECRET}`)
      .send({ title: 'Best headphones', list_id: 'price-hunt', timestamp: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.task_id).toBe('task-abc');
  });

  it('returns 401 for missing auth', async () => {
    const res = await request(app)
      .post('/trigger')
      .send({ title: 'Best headphones', list_id: 'price-hunt', timestamp: new Date().toISOString() });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing title', async () => {
    const res = await request(app)
      .post('/trigger')
      .set('Authorization', `Bearer ${VALID_SECRET}`)
      .send({ list_id: 'price-hunt', timestamp: new Date().toISOString() });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid list_id', async () => {
    const res = await request(app)
      .post('/trigger')
      .set('Authorization', `Bearer ${VALID_SECRET}`)
      .send({ title: 'Something', list_id: 'unknown-list', timestamp: new Date().toISOString() });
    expect(res.status).toBe(400);
  });
});
