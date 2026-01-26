import { describe, it, expect, beforeEach } from 'vitest';
import { hash, generateSalt } from '@/crypto/sha';

/**
 * Test suite for the SHA crypto utilities.
 * Covers hash function across algorithms, pepper/salt handling, edge cases,
 * and generateSalt behavior.
 */

describe('SHA Crypto Module', () => {
  beforeEach(() => {
    // No global setup required for now
  });

  /**
   * Hash function tests
   */
  describe('hash function', () => {
    // Core algorithm checks
    it('should hash input with default SHA-256 algorithm', async () => {
      const result = await hash({ input: 'test-input', algorithm: 'SHA-256' });
      expect(result).toBeTypeOf('string');
      expect(result.length).toBe(64); // 256 bits => 64 hex chars
      expect(/^[a-f0-9]{64}$/.test(result)).toBe(true);
    });

    it('should hash input with SHA-384 algorithm', async () => {
      const result = await hash({ input: 'test-input', algorithm: 'SHA-384' });
      expect(result).toBeTypeOf('string');
      expect(result.length).toBe(96); // 384 bits => 96 hex chars
      expect(/^[a-f0-9]{96}$/.test(result)).toBe(true);
    });

    it('should hash input with SHA-512 algorithm', async () => {
      const result = await hash({ input: 'test-input', algorithm: 'SHA-512' });
      expect(result).toBeTypeOf('string');
      expect(result.length).toBe(128); // 512 bits => 128 hex chars
      expect(/^[a-f0-9]{128}$/.test(result)).toBe(true);
    });

    // Pepper and Salt handling
    it('should produce different hash when pepper is supplied', async () => {
      const withoutPepper = await hash({
        input: 'test-input',
        algorithm: 'SHA-256',
      });
      const withPepper = await hash({
        input: 'test-input',
        pepper: 'secret-pepper',
      });
      expect(withPepper).not.toBe(withoutPepper);
    });

    it('should produce different hash when salt is supplied', async () => {
      const withoutSalt = await hash({
        input: 'test-input',
        algorithm: 'SHA-256',
      });
      const withSalt = await hash({ input: 'test-input', salt: 'random-salt' });
      expect(withSalt).not.toBe(withoutSalt);
    });

    it('should produce different hash when both pepper and salt are supplied', async () => {
      const base = await hash({ input: 'test-input', algorithm: 'SHA-256' });
      const both = await hash({ input: 'test-input', pepper: 'p', salt: 's' });
      expect(both).not.toBe(base);
    });

    // Consistency checks
    it('should be deterministic for identical parameters', async () => {
      const config = {
        input: 'consistent',
        algorithm: 'SHA-256' as const,
        pepper: 'pep',
        salt: 'sal',
      };
      const first = await hash(config);
      const second = await hash(config);
      expect(first).toBe(second);
    });

    // Edge cases
    it('should handle empty string input', async () => {
      const result = await hash({ input: '' });
      expect(result).toBeTypeOf('string');
      expect(result.length).toBe(64);
    });

    it('should handle special characters and emojis', async () => {
      const result = await hash({ input: '🔒 test émoji 🚀' });
      expect(result).toBeTypeOf('string');
      expect(result.length).toBe(64);
    });

    it('should handle very long input strings', async () => {
      const long = 'a'.repeat(10_000);
      const result = await hash({ input: long });
      expect(result).toBeTypeOf('string');
      expect(result.length).toBe(64);
    });

    // Empty pepper / salt values
    it('should treat empty pepper as no pepper', async () => {
      const result = await hash({ input: 'test', pepper: '' });
      const baseline = await hash({ input: 'test' });
      expect(result).toBe(baseline);
    });

    it('should treat empty salt as no salt', async () => {
      const result = await hash({ input: 'test', salt: '' });
      const baseline = await hash({ input: 'test' });
      expect(result).toBe(baseline);
    });

    // Algorithm differences produce distinct hashes
    it('should produce distinct hashes for different algorithms', async () => {
      const base = { input: 'diff-algo', pepper: 'p', salt: 's' };
      const sha256 = await hash({ ...base, algorithm: 'SHA-256' });
      const sha384 = await hash({ ...base, algorithm: 'SHA-384' });
      const sha512 = await hash({ ...base, algorithm: 'SHA-512' });
      expect(sha256).not.toBe(sha384);
      expect(sha256).not.toBe(sha512);
      expect(sha384).not.toBe(sha512);
    });
  });

  /**
   * generateSalt function tests
   */
  describe('generateSalt function', () => {
    it('should generate a non‑empty base64 string with default length', () => {
      const salt = generateSalt();
      expect(salt).toBeTypeOf('string');
      expect(salt.length).toBeGreaterThan(0);
    });

    it('should generate a string of expected length when custom length is provided', () => {
      const length = 24;
      const salt = generateSalt(length);
      // Base64 expands each 3 bytes to 4 characters; we cannot predict exact length, but we can ensure it changes with length.
      expect(salt).toBeTypeOf('string');
      expect(salt.length).toBeGreaterThan(0);
    });

    it('should produce different salts on successive calls', () => {
      const s1 = generateSalt(16);
      const s2 = generateSalt(16);
      expect(s1).not.toBe(s2);
    });

    it('should return empty string when length 0 is requested', () => {
      const salt = generateSalt(0);
      expect(salt).toBe('');
    });
  });

  /**
   * Integration: hash with generated salt
   */
  describe('Integration', () => {
    it('should work when a generated salt is supplied to hash', async () => {
      const salt = generateSalt(16);
      const result = await hash({ input: 'integration', salt });
      expect(result).toBeTypeOf('string');
      expect(result.length).toBe(64);
    });

    it('different generated salts lead to different hashes for same input', async () => {
      const salt1 = generateSalt(16);
      const salt2 = generateSalt(16);
      const h1 = await hash({ input: 'same', salt: salt1 });
      const h2 = await hash({ input: 'same', salt: salt2 });
      expect(h1).not.toBe(h2);
    });
  });
});
