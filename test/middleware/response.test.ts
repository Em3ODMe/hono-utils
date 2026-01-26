import { describe, it, expect } from 'vitest';
import { type HonoResponseVariables, response } from '@/middleware/response';
import { HonoLoggerVariables } from '@/middleware/logger';
import { createMiddlewareTester } from '../utils';

type Env = {
  Variables: HonoResponseVariables & HonoLoggerVariables;
};

describe(response.name, () => {
  describe('raw method', () => {
    it('should success', async () => {
      const app = createMiddlewareTester<Env>(undefined, response);
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
  });

  describe('success method', () => {
    it('should success', async () => {
      const app = createMiddlewareTester<Env>(undefined, response);
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
      const app = createMiddlewareTester<Env>(undefined, response);
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
      const app = createMiddlewareTester<Env>({ eventId: '123' }, response);
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
  });

  describe('error method', () => {
    it('should success', async () => {
      const app = createMiddlewareTester<Env>(undefined, response);
      app.get('/test', async (c) => {
        return c.var.res.error('failed', 400);
      });

      const res = await app.request('/test');

      expect(res.status).toBe(400);
      expect(await res.text()).toEqual('failed');
    });
  });
});
