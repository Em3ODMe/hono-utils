import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { formatZodError } from '@/utils/formatZodError';

describe('formatZodError', () => {
  it('formats a single issue as "path: message"', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toContain('name: ');
    }
  });

  it('joins nested paths with dots', () => {
    const result = z
      .object({ town: z.object({ name: z.string() }) })
      .safeParse({ town: { name: 1 } });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toContain('town.name: ');
    }
  });

  it('joins multiple issues with a comma', () => {
    const result = z
      .object({ a: z.number(), b: z.number() })
      .safeParse({ a: 'x', b: 'y' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodError(result.error);
      expect(formatted).toContain(', ');
      expect(formatted).toMatch(/^a: .+, b: .+$/);
    }
  });
});
