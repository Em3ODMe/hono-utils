import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { onNotFound } from '@/router/onNotFound'; // Update with your actual path
import { defaultMessageMap } from '@/router/constants';

describe(onNotFound.name, () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();

    app.get('/health', (c) => c.text('ok'));

    app.notFound(onNotFound);
  });

  describe('default behavior', () => {
    it('should return 404 and the correct error message for non-existent routes', async () => {
      const res = await app.request('/this-route-does-not-exist');
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body).toEqual({
        message: defaultMessageMap.notFound,
      });
    });

    it('should return 404 for a valid path but incorrect HTTP method', async () => {
      const res = await app.request('/health', {
        method: 'POST',
      });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body).toEqual({
        message: defaultMessageMap.notFound,
      });
    });

    it('should NOT intercept valid routes', async () => {
      const res = await app.request('/health');
      const text = await res.text();

      expect(res.status).toBe(200);
      expect(text).toBe('ok');
    });
  });

  describe('response headers', () => {
    it('should return Content-Type as application/json', async () => {
      const res = await app.request('/not-found');

      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });
});
