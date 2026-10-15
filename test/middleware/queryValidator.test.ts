import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { queryValidator } from '@/middleware/queryValidator';

describe('queryValidator', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.get(
      '/user',
      queryValidator(z.object({ q: z.string().min(1) })),
      (c) => {
        return c.json({ q: c.req.valid('query').q });
      }
    );
  });

  it('passes a valid query and returns 200', async () => {
    const res = await app.request('/user?q=hello');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'hello' });
  });

  it('returns 400 with a formatted message for an invalid query', async () => {
    const res = await app.request('/user?q=');

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('q: ');
  });

  it('returns 400 when a required query parameter is missing', async () => {
    const res = await app.request('/user');

    expect(res.status).toBe(400);
  });
});
