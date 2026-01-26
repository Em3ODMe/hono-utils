import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { isBot, type HonoIsBotVariables } from '@/middleware/isBot';
import { createMiddlewareTester } from '../utils';

type Env = {
  Variables: HonoIsBotVariables;
};

describe(isBot.name, () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = createMiddlewareTester<Env>();
  });

  describe('default configuration (threshold: 49)', () => {
    it('should detect bot when score is below threshold', async () => {
      app.get('/test', isBot({ threshold: 49 }), async (c) => {
        return c.text('ok');
      });

      const res = await app.request('/test');

      expect(res.status).toBe(500);
    });

    it('should detect bot when score is below threshold', async () => {
      app.get('/test', isBot({ threshold: 49 }), async (c) => {
        return c.text('ok');
      });
      const req = new Request('http://localhost/test');

      Object.defineProperty(req, 'cf', {
        value: {
          botManagement: {
            score: 30,
            verifiedBot: false,
          },
        },
        writable: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should detect bot when score is below threshold', async () => {
      app.get('/test', isBot({ threshold: 80 }), async (c) => {
        return c.text('ok');
      });
      const req = new Request('http://localhost/test');

      Object.defineProperty(req, 'cf', {
        value: {
          botManagement: {
            verifiedBot: false,
          },
        },
        writable: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should detect bot when score is below threshold', async () => {
      app.get(
        '/test',
        isBot({ threshold: 49, allowVerifiedBot: true }),
        async (c) => {
          return c.text(c.get('isBot')?.toString());
        }
      );
      const req = new Request('http://localhost/test');

      Object.defineProperty(req, 'cf', {
        value: {
          botManagement: {
            score: 30,
            verifiedBot: true,
          },
        },
        writable: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('true');
    });

    it('should detect bot when score is below threshold', async () => {
      app.get(
        '/test',
        isBot({ threshold: 49, allowVerifiedBot: true }),
        async (c) => {
          return c.text(c.get('isBot')?.toString());
        }
      );
      const req = new Request('http://localhost/test');

      Object.defineProperty(req, 'cf', {
        value: {
          botManagement: {
            score: 48,
            verifiedBot: undefined,
          },
        },
        writable: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });
  });

  describe('default configuration (threshold: 49)', () => {
    it('should detect bot when score is below threshold', async () => {
      app.get('/test', isBot({ threshold: 51 }), async (c) => {
        return c.text('ok');
      });
      const req = new Request('http://localhost/test');

      Object.defineProperty(req, 'cf', {
        value: {
          botManagement: {
            score: 60,
            verifiedBot: false,
          },
        },
        writable: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
    });
  });
});
