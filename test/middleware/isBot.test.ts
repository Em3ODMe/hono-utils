import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { isBot, type HonoIsBotVariables } from '@/middleware/isBot';
import { logger, type HonoLoggerVariables } from '@/middleware/logger';
import { createMiddlewareTester } from '../utils';

type Env = {
  Variables: HonoIsBotVariables;
};

const createRequestWithBotManagement = (
  botManagement: { score?: number; verifiedBot?: boolean },
  path = 'http://localhost/test'
) => {
  const req = new Request(path);
  Object.defineProperty(req, 'cf', {
    value: {
      botManagement,
    },
    writable: false,
  });
  return req;
};

describe(isBot.name, () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = createMiddlewareTester<Env>();
  });

  describe('when botManagement is missing', () => {
    it('should return 500', async () => {
      app.get('/test', isBot({ threshold: 49 }), async (c) => {
        return c.text('ok');
      });

      const res = await app.request('/test');

      expect(res.status).toBe(500);
    });
  });

  describe('default configuration (threshold: 49)', () => {
    it('should return 401 when score is below the threshold', async () => {
      app.get('/test', isBot({ threshold: 49 }), async (c) => {
        return c.text('ok');
      });
      const req = createRequestWithBotManagement({
        score: 30,
        verifiedBot: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should return 401 when score defaults to 54 and is below the threshold', async () => {
      app.get('/test', isBot({ threshold: 80 }), async (c) => {
        return c.text('ok');
      });
      const req = createRequestWithBotManagement({
        verifiedBot: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should allow verified bots below the threshold when allowVerifiedBot is true', async () => {
      app.get(
        '/test',
        isBot({ threshold: 49, allowVerifiedBot: true }),
        async (c) => {
          return c.text(c.get('isBot')?.toString());
        }
      );
      const req = createRequestWithBotManagement({
        score: 30,
        verifiedBot: true,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('true');
    });

    it('should block non-verified bots below the threshold even when allowVerifiedBot is true', async () => {
      app.get(
        '/test',
        isBot({ threshold: 49, allowVerifiedBot: true }),
        async (c) => {
          return c.text(c.get('isBot')?.toString());
        }
      );
      const req = createRequestWithBotManagement({
        score: 48,
        verifiedBot: undefined,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should treat a score equal to the threshold as human', async () => {
      app.get('/test', isBot({ threshold: 49 }), async (c) => {
        return c.text(c.get('isBot')?.toString());
      });
      const req = createRequestWithBotManagement({
        score: 49,
        verifiedBot: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('false');
    });

    it('should treat a score of 100 as human and set isBot to false', async () => {
      app.get('/test', isBot({ threshold: 49 }), async (c) => {
        return c.text(c.get('isBot')?.toString());
      });
      const req = createRequestWithBotManagement({
        score: 100,
        verifiedBot: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('false');
    });

    it('should block verified bots below the threshold when allowVerifiedBot is not set', async () => {
      app.get('/test', isBot({ threshold: 49 }), async (c) => {
        return c.text('ok');
      });
      const req = createRequestWithBotManagement({
        score: 30,
        verifiedBot: true,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });
  });

  describe('above the threshold', () => {
    it('should pass when the score is above the threshold', async () => {
      app.get('/test', isBot({ threshold: 51 }), async (c) => {
        return c.text('ok');
      });
      const req = createRequestWithBotManagement({
        score: 60,
        verifiedBot: false,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
    });
  });

  describe('with useLogger', () => {
    type LoggedEnv = {
      Variables: HonoIsBotVariables & HonoLoggerVariables;
    };

    it('should log to the middleware:isBot area and still detect bots', async () => {
      const loggedApp = createMiddlewareTester<LoggedEnv>(
        undefined,
        logger({ details: { instance: 'isBot' } })
      );

      loggedApp.get('/test', isBot({ threshold: 49, useLogger: true }), (c) => {
        const area = c.var.logger.retrieveAreaEvents('middleware:isBot');
        return c.json({
          isBot: c.get('isBot'),
          messages: area.map((entry) => entry.message),
        });
      });

      const req = createRequestWithBotManagement({
        score: 100,
        verifiedBot: false,
      });
      const res = await loggedApp.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        isBot: false,
        messages: [
          'Retrieving bot management data from cloudflare data',
          'Setting isBot variable in context',
          'isBot variable set',
        ],
      });
    });
  });
});
