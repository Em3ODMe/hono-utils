import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Queue } from '@cloudflare/workers-types';
import { queue } from '@/middleware/queue';
import type { HonoLoggerVariables } from '@/middleware';
import type { QueueHandler } from '@/queue/QueueHandler';
import { onError } from '@/router/onError';
import { createMiddlewareTester } from '../utils';
import { createLogger } from 'hierarchical-area-logger';

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
} as unknown as QueueHandler<any, Record<string, unknown>, unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Env = {
  Bindings: { QUEUE: Queue };
  Variables: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    QUEUE: QueueHandler<any, unknown, unknown>;
    language: string;
  } & HonoLoggerVariables;
};

type Producer = (handler: string, content: unknown) => Promise<void>;

type FinalizeEnv = {
  Bindings: { QUEUE: Queue };
  Variables: HonoLoggerVariables & { QUEUE: Producer };
};

type MultiEnv = {
  Bindings: { QUEUE_A: Queue; QUEUE_B: Queue };
  Variables: HonoLoggerVariables & { language: string };
};

const createQueueMock = () => ({
  send: vi.fn(),
  sendBatch: vi.fn(),
});

describe(queue.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Should fail', () => {
    it('throws when the named queue binding is missing', async () => {
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
  });

  describe('name auto-detection', () => {
    it('auto-detects a single queue binding when name is omitted', async () => {
      const queueMock = createQueueMock();
      const app = createMiddlewareTester<Env>(
        undefined,
        queue({ queueHandler })
      );

      app.get('/index', async (c) => {
        // The producer must be set in the context under the detected key
        return c.text(
          typeof (c.get('QUEUE') as unknown) === 'function'
            ? 'producer-set'
            : 'not-set'
        );
      });

      const res = await app.request(
        '/index',
        {},
        {
          QUEUE: queueMock as unknown as Queue,
        }
      );

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('producer-set');
      expect(queueHandler.getProducer).toHaveBeenCalledWith(queueMock, {
        parentEventId: undefined,
        language: undefined,
      });
    });

    it('fails when multiple queue bindings exist and name is omitted', async () => {
      const app = createMiddlewareTester<MultiEnv>(
        undefined,
        queue({ queueHandler })
      );

      app.get('/index', async (c) => {
        return c.text('ok');
      });

      const res = await app.request(
        '/index',
        {},
        {
          QUEUE_A: createQueueMock() as unknown as Queue,
          QUEUE_B: createQueueMock() as unknown as Queue,
        }
      );

      expect(res.status).toBe(500);
    });

    it('fails when no queue binding exists and name is omitted', async () => {
      const app = createMiddlewareTester<MultiEnv>(
        undefined,
        queue({ queueHandler })
      );

      app.get('/index', async (c) => {
        return c.text('ok');
      });

      const res = await app.request('/index', {}, {} as MultiEnv['Bindings']);

      expect(res.status).toBe(500);
    });

    it('uses the explicit name when multiple queue bindings exist', async () => {
      const queueMockB = createQueueMock();
      const app = createMiddlewareTester<MultiEnv>(
        undefined,
        queue({ name: 'QUEUE_B', queueHandler })
      );

      app.get('/index', async (c) => {
        return c.text('ok');
      });

      const res = await app.request(
        '/index',
        {},
        {
          QUEUE_A: createQueueMock() as unknown as Queue,
          QUEUE_B: queueMockB as unknown as Queue,
        }
      );

      expect(res.status).toBe(200);
      expect(queueHandler.getProducer).toHaveBeenCalledWith(queueMockB, {
        parentEventId: undefined,
        language: undefined,
      });
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

    it('passes parentEventId and language from the context to the producer', async () => {
      const app = createMiddlewareTester<Env>(
        {
          logger: createLogger({
            details: {
              instance: 'test',
              service: 'test',
            },
            eventId: 'test-event-id',
          }),
          language: 'en',
        },
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
      expect(queueHandler.getProducer).toHaveBeenCalledWith(expect.anything(), {
        parentEventId: 'test-event-id',
        language: 'en',
      });
    });

    it('invokes callOnFinalization after the response with the producer and context', async () => {
      const onFinalization = vi.fn();
      const app = createMiddlewareTester<Env>(
        undefined,
        queue({
          name: 'QUEUE',
          queueHandler,
          callOnFinalization: async (producer, context) => {
            onFinalization(producer, context);
          },
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
      expect(onFinalization).toHaveBeenCalledTimes(1);
      expect(onFinalization).toHaveBeenCalledWith(
        handler,
        expect.objectContaining({
          get: expect.any(Function),
          env: expect.objectContaining({ QUEUE: expect.any(Function) }),
        })
      );
    });

    it('sends the logger dump through the producer when callOnFinalization is used', async () => {
      const app = createMiddlewareTester<Env>(
        {
          logger: createLogger({
            details: {
              instance: 'test',
              service: 'test',
            },
            eventId: 'test-event-id',
          }),
        },
        queue({
          name: 'QUEUE',
          queueHandler,
          callOnFinalization: async (producer, { get }) => {
            await producer('log', get('logger').dump());
          },
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
      expect(handler).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({ root: expect.any(Array) })
      );
    });

    it('can finalize the log in onError when the request fails', async () => {
      const app = createMiddlewareTester<FinalizeEnv>(
        {
          logger: createLogger({
            details: {
              instance: 'test',
              service: 'test',
            },
            eventId: 'test-event-id',
          }),
        },
        queue({
          name: 'QUEUE',
          queueHandler,
        })
      );

      app.get('/index', async () => {
        throw new Error('boom');
      });

      // The queue middleware only finalizes after a successful `next()`.
      // Finalize failed requests from `onError` instead: the producer and
      // logger are both still available on the context there.
      app.onError(
        onError<FinalizeEnv>(async (err, _env, get) => {
          await get('QUEUE')('log', get('logger').dump());
          return err.message;
        })
      );

      const res = await app.request(
        '/index',
        {},
        {
          QUEUE: vi.fn(),
        }
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ message: 'boom' });
      expect(handler).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({ root: expect.any(Array) })
      );
    });
  });
});
