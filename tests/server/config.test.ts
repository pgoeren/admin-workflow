describe('config validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws if WEBHOOK_SECRET is missing', () => {
    delete process.env.WEBHOOK_SECRET;
    expect(() => require('@/config')).toThrow('WEBHOOK_SECRET');
  });

  it('throws if FIREBASE_PROJECT_ID is missing', () => {
    process.env.WEBHOOK_SECRET = 'test-secret-that-is-long-enough-to-pass';
    delete process.env.FIREBASE_PROJECT_ID;
    expect(() => require('@/config')).toThrow('FIREBASE_PROJECT_ID');
  });

  it('returns config when all required vars are set', () => {
    process.env.WEBHOOK_SECRET = 'test-secret-that-is-long-enough-to-pass';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----\n';
    process.env.PORT = '3001';
    const config = require('@/config').default;
    expect(config.webhookSecret).toBe('test-secret-that-is-long-enough-to-pass');
    expect(config.port).toBe(3001);
  });
});
