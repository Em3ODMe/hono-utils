import { describe, it, expect } from 'vitest';
import { type HonoLoggerVariables, logger } from '@/middleware/logger';
import { withLogger } from '@/middleware/withLogger';
import { createMiddlewareTester } from '../utils';

type Env = {
  Bindings: Record<string, unknown>;
  Variables: HonoLoggerVariables;
};

type EnvWithRequestId = {
  Bindings: Record<string, unknown>;
  Variables: HonoLoggerVariables & { requestId: string };
};

const details = { instance: 'withLogger', service: 'withLogger' };

describe(withLogger.name, () => {
  it('should scope logs to the middleware area and continue to the next handler', async () => {
    const app = createMiddlewareTester<Env>(undefined, logger({ details }));

    app.use(
      '*',
      withLogger<Env>('auth', async (_c, { info, debug }) => {
        debug('checking token');
        info('auth passed');
      })
    );

    app.get('/test', (c) => {
      const area = c.var.logger.retrieveAreaEvents('middleware:auth');

      return c.json({
        messages: area.map((entry) => entry.message),
        types: area.map((entry) => entry.type),
      });
    });

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      messages: ['checking token', 'auth passed'],
      types: ['debug', 'info'],
    });
  });

  it('should provide eventId, dump and dumpFlat bound to the request logger', async () => {
    const app = createMiddlewareTester<Env>(undefined, logger({ details }));

    app.use(
      '*',
      withLogger<Env>('auth', async (c, { eventId, dump, dumpFlat }) => {
        // Calling dump/dumpFlat would throw if they were detached from the
        // logger instance (they rely on `this`).
        const grouped = dump();
        const flat = dumpFlat();

        if (eventId !== c.get('eventId')) {
          throw new Error('eventId does not match the request eventId');
        }

        if (!('root' in grouped) || flat.length === 0) {
          throw new Error('dump/dumpFlat results are malformed');
        }
      })
    );

    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('should pass the context through to the wrapped middleware', async () => {
    const app = createMiddlewareTester<EnvWithRequestId>(
      { requestId: 'req-123' },
      logger({ details })
    );

    app.use(
      '*',
      withLogger<EnvWithRequestId>('auth', async (c, { info }) => {
        info('request received', { requestId: c.get('requestId') });
      })
    );

    app.get('/test', (c) =>
      c.json({
        payload: c.var.logger.retrieveAreaEvents('middleware:auth')[0]?.payload,
      })
    );

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      payload: { requestId: 'req-123' },
    });
  });

  it('should return 500 when the logger middleware has not run first', async () => {
    const app = createMiddlewareTester<Env>(
      undefined,
      withLogger<Env>('auth', async () => undefined)
    );

    app.get('/test', (c) => c.text('ok'));

    const res = await app.request('/test');

    expect(res.status).toBe(500);
  });
});
