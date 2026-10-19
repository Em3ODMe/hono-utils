import { describe, it, expect } from 'vitest';
import { type HonoLoggerVariables, logger } from '@/middleware/logger';
import { createMiddlewareTester } from '../utils';

type Env = {
  Bindings: Record<string, unknown>;
  Variables: HonoLoggerVariables;
};

type TraceEnv = {
  Bindings: Record<string, unknown>;
  Variables: HonoLoggerVariables & { traceEnabled: boolean };
};

const details = { instance: 'logger', service: 'logger' };

describe(logger.name, () => {
  it('should set logger and event id in context with default options', async () => {
    const app = createMiddlewareTester<Env>(undefined, logger({ details }));
    app.get('/test', async (c) => {
      const logDump = c.var.logger.dump();

      if (!c.var.eventId) {
        throw new Error('Event ID is not set');
      }

      return c.json({
        rootMessagesCount: logDump.root.length,
        logger: !!c.var.logger,
        eventId: !!c.var.eventId,
      });
    });

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      logger: true,
      eventId: true,
      rootMessagesCount: 2,
    });
  });

  it('should log an error when the parent event id header is expected but missing', async () => {
    const app = createMiddlewareTester<Env>(
      undefined,
      logger({ details, parentEventIdHeader: 'parent-event-id' })
    );
    app.get('/test', async (c) => {
      const logDump = c.var.logger.dump();

      if (!c.var.eventId) {
        throw new Error('Event ID is not set');
      }

      return c.json({
        rootMessagesCount: logDump.root.length,
        logger: !!c.var.logger,
        eventId: !!c.var.eventId,
      });
    });

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      logger: true,
      eventId: true,
      rootMessagesCount: 3,
    });
  });

  it('should link the logger to the parent event id from the request header', async () => {
    const app = createMiddlewareTester<Env>(
      undefined,
      logger({ details, parentEventIdHeader: 'parent-event-id' })
    );
    app.get('/test', async (c) => {
      const logDump = c.var.logger.dump();

      if (!c.var.eventId) {
        throw new Error('Event ID is not set');
      }

      return c.json({
        rootMessagesCount: logDump.root.length,
        logger: !!c.var.logger,
        eventId: !!c.var.eventId,
      });
    });

    const res = await app.request('/test', {
      headers: {
        'parent-event-id': 'parent-event-id',
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      logger: true,
      eventId: true,
      rootMessagesCount: 2,
    });
  });

  it('should use a custom event id factory', async () => {
    const app = createMiddlewareTester<Env>(
      undefined,
      logger({ details, createEventId: () => 'custom-event-id' })
    );
    app.get('/test', (c) => c.json({ eventId: c.var.eventId }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventId: 'custom-event-id' });
  });

  it('should await an async custom event id factory', async () => {
    const app = createMiddlewareTester<Env>(
      undefined,
      logger({ details, createEventId: async () => 'async-event-id' })
    );
    app.get('/test', (c) => c.json({ eventId: c.var.eventId }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventId: 'async-event-id' });
  });

  it('should set the eventId response header when eventIdHeader is configured', async () => {
    const app = createMiddlewareTester<Env>(
      undefined,
      logger({
        details,
        createEventId: () => 'custom-event-id',
        eventIdHeader: 'x-request-id',
      })
    );
    app.get('/test', (c) => c.json({ eventId: c.var.eventId }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventId: 'custom-event-id' });
    expect(res.headers.get('x-request-id')).toBe('custom-event-id');
  });

  it('should default to the x-event-id header when eventIdHeader is omitted', async () => {
    const app = createMiddlewareTester<Env>(
      undefined,
      logger({ details, createEventId: () => 'custom-event-id' })
    );
    app.get('/test', (c) => c.json({ eventId: c.var.eventId }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(res.headers.get('x-event-id')).toBe('custom-event-id');
  });

  it('should resolve details and dump options from bindings per request', async () => {
    const app = createMiddlewareTester<Env>(
      undefined,
      logger<Env, { environment: string }>({
        details: ({ bindings }) => ({
          instance: bindings.SERVICE_NAME as string,
          environment: bindings.ENVIRONMENT as string,
        }),
        dumpOptions: ({ bindings }) =>
          bindings.ENVIRONMENT === 'production' ? { omitRoot: true } : {},
      })
    );
    app.get('/test', (c) => {
      const rootPayload = c.var.logger.retrieveRootPayload();

      return c.json({
        instance: rootPayload.details.instance,
        environment: rootPayload.details.environment as string,
        rootOmitted: !('root' in c.var.logger.dump()),
      });
    });

    const res = await app.request(
      '/test',
      {},
      {
        SERVICE_NAME: 'payment-service',
        ENVIRONMENT: 'production',
      }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      instance: 'payment-service',
      environment: 'production',
      rootOmitted: true,
    });
  });

  it('should resolve dump options from variables set before the logger', async () => {
    const app = createMiddlewareTester<TraceEnv>(
      { traceEnabled: true },
      logger<TraceEnv>({
        details,
        dumpOptions: ({ variables }) =>
          variables.traceEnabled ? { finalizeLog: false } : {},
      })
    );
    app.get('/test', (c) =>
      c.json({ rootMessagesCount: c.var.logger.dump().root.length })
    );

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rootMessagesCount: 1 });
  });
});
