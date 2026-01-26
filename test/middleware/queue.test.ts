import { describe, it, expect, vi } from 'vitest';
import type { Queue } from '@cloudflare/workers-types';
import { queue } from '@/middleware/queue';
import type { HonoLoggerVariables } from '@/middleware';
import type { QueueHandler } from '@/queue/QueueHandler';
import { createMiddlewareTester } from '../utils';
import { Logger } from 'hierarchical-area-logger';

const handler = vi.fn();

const queueHandler = {
  getProducer: vi.fn().mockReturnValue(handler),
  getConsumer: vi.fn(),
  handlers: {},
  config: {
    schema: undefined,
    setContext: vi.fn(),
  },
  addHandler: vi.fn(),
} as unknown as QueueHandler<any, unknown, unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Env = {
  Bindings: { QUEUE: Queue };
  Variables: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    QUEUE: QueueHandler<any, unknown, unknown>;
  } & HonoLoggerVariables;
};

describe(queue.name, () => {
  describe('Should fail', () => {
    it('validate', async () => {
      const app = createMiddlewareTester<Env>(
        undefined,
        queue({
          name: 'QUEUE',
          queueHandler,
        })
      );

      app.get('/index', async (c) => {
        return c.text('ok');
      });
      const res = await app.request(
        '/index',
        {},
        {
          QUEUE: undefined,
        }
      );
      expect(res.status).toBe(500);
    });

    it('validate', async () => {
      const app = createMiddlewareTester<Env>(
        undefined,
        queue({
          name: 'QUEUE',
          queueHandler,
          finalizeLogHandler: 'log',
        })
      );

      app.get('/index', async (c) => {
        return c.text('ok');
      });
      const res = await app.request(
        '/index',
        {},
        {
          QUEUE: vi.fn(),
        }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('Should success', () => {
    it('validate', async () => {
      const app = createMiddlewareTester<Env>(
        undefined,
        queue({
          name: 'QUEUE',
          queueHandler,
        })
      );

      app.get('/index', async (c) => {
        return c.text('ok');
      });
      const res = await app.request(
        '/index',
        {},
        {
          QUEUE: vi.fn(),
        }
      );
      expect(res.status).toBe(200);
    });

    it('validate', async () => {
      const app = createMiddlewareTester<Env>(
        {
          logger: new Logger({
            details: {
              service: 'test',
            },
          }),
        },
        queue({
          name: 'QUEUE',
          queueHandler,
          finalizeLogHandler: 'log',
        })
      );

      app.get('/index', async (c) => {
        return c.text('ok');
      });
      const res = await app.request(
        '/index',
        {},
        {
          QUEUE: vi.fn(),
        }
      );
      expect(res.status).toBe(200);
    });
  });
});
