import { describe, it, expect } from 'vitest';
import { createLogger } from 'hierarchical-area-logger';
import { withLogger } from '@/middleware/withLogger';
import type { HonoLoggerVariables } from '@/middleware/logger';
import { createMiddlewareTester } from '../utils';

type Env = {
  Variables: HonoLoggerVariables & { test: string };
};

const wrapperMiddleware = withLogger<Env>('test', async (c, { info }) => {
  info('Middleware initialized');
  c.set('test', 'test');
});

describe(withLogger.name, () => {
  describe('should fail', () => {
    it('should validate API key using injected Env', async () => {
      const app = createMiddlewareTester<Env>(undefined, wrapperMiddleware);

      app.get('/index', async (c) => {
        return c.text(c.get('test'));
      });

      const res = await app.request('/index');

      expect(res.status).toBe(500);
    });
  });

  describe('should succeed', () => {
    it('should validate API key using injected Env', async () => {
      const app = createMiddlewareTester<Env>(
        {
          logger: createLogger({
            details: {
              service: 'test',
            },
          }),
          eventId: '123',
        },
        wrapperMiddleware
      );

      app.get('/index', async (c) => {
        return c.text(c.get('test'));
      });

      const res = await app.request('/index');

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('test');
    });
  });
});
