import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonValidator } from '@/middleware/jsonValidator';

describe('jsonValidator', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.post(
      '/user',
      jsonValidator(z.object({ name: z.string().min(1), age: z.number() })),
      (c) => {
        return c.json(c.req.valid('json'), 201);
      }
    );
  });

  it('passes valid data through and returns 201 with parsed data', async () => {
    const res = await app.request('/user', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice', age: 30 }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns 400 with formatted messages for invalid data', async () => {
    const res = await app.request('/user', {
      method: 'POST',
      body: JSON.stringify({ name: '', age: 'not-a-number' }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('name: ');
    expect(text).toContain('age: ');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await app.request('/user', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Malformed JSON in request body');
  });
});
