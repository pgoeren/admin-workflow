import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '@/server/middleware';

// Set secret before requiring module
process.env.WEBHOOK_SECRET = 'test-secret-that-is-long-enough-ok';
process.env.FIREBASE_PROJECT_ID = 'test';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';

const mockRes = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('authMiddleware', () => {
  it('calls next() with valid Bearer token', () => {
    const req = { headers: { authorization: 'Bearer test-secret-that-is-long-enough-ok' } } as Request;
    const next = jest.fn() as NextFunction;
    authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 with missing Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    authMiddleware(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 with wrong secret', () => {
    const req = { headers: { authorization: 'Bearer wrong-secret' } } as Request;
    const res = mockRes();
    authMiddleware(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
