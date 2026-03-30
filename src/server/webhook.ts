import { Router, Request, Response } from 'express';
import { authMiddleware } from '@/server/middleware';
import { createTask } from '@/db/tasks';
import { ListId } from '@/db/schema';

const VALID_LIST_IDS: ListId[] = ['price-hunt', 'trip-planner', 'experience-scout', 'admin'];

export const webhookRouter = Router();

webhookRouter.use(authMiddleware);

webhookRouter.post('/', async (req: Request, res: Response) => {
  const { title, list_id, timestamp } = req.body;

  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'Missing or invalid title' });
    return;
  }
  if (!VALID_LIST_IDS.includes(list_id)) {
    res.status(400).json({ error: `Invalid list_id. Must be one of: ${VALID_LIST_IDS.join(', ')}` });
    return;
  }

  const task_id = await createTask(title.trim(), list_id as ListId);
  res.status(200).json({ task_id, status: 'queued' });
});
