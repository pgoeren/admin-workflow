import { Request, Response, NextFunction } from 'express';
import config from '@/config';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  const token = auth.slice(7);
  if (token !== config.webhookSecret) {
    res.status(401).json({ error: 'Invalid secret' });
    return;
  }
  next();
}
