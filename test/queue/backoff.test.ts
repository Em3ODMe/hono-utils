import { describe, expect, it } from 'vitest';
import {
  MAX_RETRY_DELAY_SECONDS,
  calculateClampedBackoff,
  calculateExponentialBackoff,
} from '@/queue/backoff';

describe('calculateExponentialBackoff', () => {
  it('computes base ** attempts', () => {
    expect(calculateExponentialBackoff(1, 2)).toBe(2);
    expect(calculateExponentialBackoff(2, 2)).toBe(4);
    expect(calculateExponentialBackoff(3, 2)).toBe(8);
    expect(calculateExponentialBackoff(4, 2)).toBe(16);
  });

  it('returns 1 for zero attempts', () => {
    expect(calculateExponentialBackoff(0, 2)).toBe(1);
  });

  it('stays at the base for a base of 1', () => {
    expect(calculateExponentialBackoff(10, 1)).toBe(1);
  });
});

describe('calculateClampedBackoff', () => {
  it('returns the raw value when under the maximum', () => {
    expect(calculateClampedBackoff(2, 3)).toBe(9);
  });

  it('clamps to the Cloudflare maximum', () => {
    // 2 ** 16 = 65536, above the 43200 limit
    expect(calculateClampedBackoff(16, 2)).toBe(MAX_RETRY_DELAY_SECONDS);
  });

  it('exposes the maximum as a constant', () => {
    expect(MAX_RETRY_DELAY_SECONDS).toBe(43200);
  });
});
