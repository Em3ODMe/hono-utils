import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BodyInit, ResponseInit } from '@cloudflare/workers-types';
import { type HonoResponseVariables, response } from '@/middleware/response';
import { HonoLoggerVariables } from '@/middleware/logger';
import { createMiddlewareTester } from '../utils';

type Env = {
  Variables: HonoResponseVariables & HonoLoggerVariables;
};

describe(response.name, () => {
  describe('raw method', () => {
    it('should success', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.raw({
          status: 400,
          data: {
            test: 'test',
          },
        });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        data: {
          test: 'test',
        },
      });
    });

    it('should default to 200 when no status is provided', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.raw({ data: { test: 'test' } });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { test: 'test' } });
    });
  });

  describe('success method', () => {
    it('should success', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.success('ok');
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        message: 'ok',
      });
    });
    it('should success', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.success('ok', { test: 'test' });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        message: 'ok',
        data: {
          test: 'test',
        },
      });
    });
    it('should success', async () => {
      const app = createMiddlewareTester<Env>({ eventId: '123' }, response());
      app.get('/test', async (c) => {
        return c.var.res.success('ok', { test: 'test' });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        message: 'ok',
        data: {
          test: 'test',
        },
      });
    });

    it('should use an explicit success status code', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.success('created', { test: 'test' }, 201);
      });

      const res = await app.request('/test');

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        message: 'created',
        data: {
          test: 'test',
        },
      });
    });
  });

  describe('successNoContent method', () => {
    it('should return the message with a default 200 status', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.successNoContent('done');
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: 'done' });
    });

    it('should return an empty body with a 204 status', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.successNoContent('done', 204);
      });

      const res = await app.request('/test');

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    it('should return an empty body with a 304 status', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.successNoContent('done', 304);
      });

      const res = await app.request('/test');

      expect(res.status).toBe(304);
      expect(await res.text()).toBe('');
    });
  });

  describe('null-body statuses', () => {
    it('should return an empty body when success uses a 204 status', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.success('done', { test: 'test' }, 204);
      });

      const res = await app.request('/test');

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    it('should return an empty body when raw uses a 204 status', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.raw({ status: 204, data: { test: 'test' } });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });
  });

  describe('error method', () => {
    it('should return a JSON body consistent with raw and success', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.error('failed', 400);
      });

      const res = await app.request('/test');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: 'failed' });
    });
  });

  describe('x-event-id header', () => {
    it('should set the x-event-id header when eventId is present', async () => {
      const app = createMiddlewareTester<Env>(
        { eventId: 'event-123' },
        response()
      );
      app.get('/test', async (c) => {
        return c.var.res.success('ok', { test: 'test' });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('x-event-id')).toBe('event-123');
    });

    it('should not set the x-event-id header when eventId is missing', async () => {
      const app = createMiddlewareTester<Env>(undefined, response());
      app.get('/test', async (c) => {
        return c.var.res.success('ok', { test: 'test' });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('x-event-id')).toBeNull();
    });
  });

  describe('eventIdHeader option', () => {
    it('should use a custom header name when eventIdHeader is provided', async () => {
      const app = createMiddlewareTester<Env>(
        { eventId: 'event-123' },
        response({ eventIdHeader: 'x-request-id' })
      );
      app.get('/test', async (c) => {
        return c.var.res.success('ok', { test: 'test' });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('x-request-id')).toBe('event-123');
      expect(res.headers.get('x-event-id')).toBeNull();
    });

    it('should default to x-event-id when eventIdHeader is not provided', async () => {
      const app = createMiddlewareTester<Env>(
        { eventId: 'event-123' },
        response()
      );
      app.get('/test', async (c) => {
        return c.var.res.success('ok', { test: 'test' });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('x-event-id')).toBe('event-123');
    });

    it('should not set the custom header when eventId is missing', async () => {
      const app = createMiddlewareTester<Env>(
        undefined,
        response({ eventIdHeader: 'x-request-id' })
      );
      app.get('/test', async (c) => {
        return c.var.res.success('ok', { test: 'test' });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('x-request-id')).toBeNull();
    });
  });

  describe('websocket method', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns a 101 response carrying the client side of the pair', async () => {
      // Node's Response rejects status 101, so emulate the Cloudflare
      // runtime's lenient Response for this test.
      class LenientResponse extends Response {
        webSocket: WebSocket | null = null;

        constructor(body: BodyInit | null, init?: ResponseInit) {
          const { status = 200, webSocket, ...rest } = init ?? {};
          super(body, { status: status === 101 ? 200 : status, ...rest });
          if (status === 101) {
            Object.defineProperty(this, 'status', { value: 101 });
            this.webSocket = webSocket ?? null;
          }
        }
      }
      vi.stubGlobal('Response', LenientResponse);

      const app = createMiddlewareTester<Env>(undefined, response());
      const clientSocket = {} as WebSocket;
      const serverSocket = {} as WebSocket;

      app.get('/test', async (c) => {
        return c.var.res.websocket({ 0: clientSocket, 1: serverSocket });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(101);
      expect((res as unknown as { webSocket?: WebSocket }).webSocket).toBe(
        clientSocket
      );
    });
  });
});
