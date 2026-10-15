import { describe, it, expect, beforeEach } from 'vitest';
import { hash, verify } from '@/crypto/pbkdf2';

describe('PBKDF2 Module', () => {
  beforeEach(() => {
    // No global setup required for now
  });

  describe('hash function', () => {
    it('produces 64-hex string with default iterations', async () => {
      const hex = await hash('password', 'test-salt-012345');
      expect(typeof hex).toBe('string');
      expect(hex).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hex)).toBe(true);
    });

    it('is deterministic for identical inputs', async () => {
      const a = await hash('password', 'test-salt-012345', 1000);
      const b = await hash('password', 'test-salt-012345', 1000);
      expect(a).toBe(b);
    });

    it('produces different hashes with different salts', async () => {
      const h1 = await hash('password', 'salt-one-1234567', 1000);
      const h2 = await hash('password', 'salt-two-1234567', 1000);
      expect(h1).not.toBe(h2);
    });

    it('handles unicode passwords', async () => {
      const h = await hash('päßwörd😊', 'test-salt-012345', 50000);
      expect(typeof h).toBe('string');
      expect(h).toHaveLength(64);
    });

    it('produces different hashes with different inputs', async () => {
      const h1 = await hash('password1', 'test-salt-012345', 1000);
      const h2 = await hash('password2', 'test-salt-012345', 1000);
      expect(h1).not.toBe(h2);
    });
  });

  describe('verify', () => {
    it('verifies correct password', async () => {
      const pass = 'correct horse battery staple';
      const salt = 'test-salt-012345';
      const h = await hash(pass, salt, 1000);
      expect(await verify(pass, salt, h, 1000)).toBe(true);
    });

    it('fails for incorrect password', async () => {
      const pass = 'correct horse battery staple';
      const salt = 'test-salt-012345';
      const h = await hash(pass, salt, 1000);
      expect(await verify('wrong password', salt, h, 1000)).toBe(false);
    });

    it('fails if salt differs', async () => {
      const pass = 'secret';
      const h = await hash('secret', 'test-salt-012345', 1000);
      expect(await verify(pass, 'different-salt-42', h, 1000)).toBe(false);
    });

    it('fails if iteration count differs', async () => {
      const pass = 'secret';
      const salt = 'test-salt-012345';
      const h = await hash(pass, salt, 1000);
      expect(await verify(pass, salt, h, 500)).toBe(false);
    });

    it('fails if partial hash matches (tests line 91 coverage)', async () => {
      const pass = 'secret';
      const salt = 'test-salt-012345';
      const h = await hash(pass, salt, 1000);
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(h.substr(i * 2, 2), 16);
      }
      const modifiedBytes = new Uint8Array(bytes);
      modifiedBytes[31] ^= 0x01;
      const modifiedHash = Array.from(modifiedBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      expect(modifiedHash).not.toBe(h);
      expect(await verify(pass, salt, modifiedHash, 1000)).toBe(false);
    });

    it('fails if stored hash length differs (covers line 91)', async () => {
      const pass = 'secret';
      const salt = 'test-salt-012345';
      const h = await hash(pass, salt, 1000);

      // Shorten the hash to trigger length mismatch
      const shortHash = h.substring(0, 60);
      expect(await verify(pass, salt, shortHash, 1000)).toBe(false);
    });

    it('returns false (does not throw) for an empty stored hash', async () => {
      const pass = 'secret';
      const salt = 'test-salt-012345';

      await expect(verify(pass, salt, '', 1000)).resolves.toBe(false);
    });

    it('returns false for an odd-length stored hash', async () => {
      const pass = 'secret';
      const salt = 'test-salt-012345';
      const h = await hash(pass, salt, 1000);

      await expect(verify(pass, salt, `${h}a`, 1000)).resolves.toBe(false);
    });

    it('returns false for a non-hex stored hash of correct length', async () => {
      const pass = 'secret';
      const salt = 'test-salt-012345';

      await expect(verify(pass, salt, 'zz'.repeat(32), 1000)).resolves.toBe(
        false
      );
    });

    it('accepts an uppercase-hex stored hash', async () => {
      const pass = 'correct horse battery staple';
      const salt = 'test-salt-012345';
      const h = await hash(pass, salt, 1000);

      expect(await verify(pass, salt, h.toUpperCase(), 1000)).toBe(true);
    });
  });

  describe('input validation', () => {
    const SALT = 'test-salt-012345';

    it('accepts a salt of exactly 16 bytes', async () => {
      await expect(hash('password', SALT, 1000)).resolves.toHaveLength(64);
    });

    it('rejects a salt shorter than 16 bytes', async () => {
      await expect(hash('password', 'short', 1000)).rejects.toThrow(RangeError);
      await expect(hash('password', '', 1000)).rejects.toThrow(RangeError);
    });

    it('counts multi-byte characters toward the salt length', async () => {
      // 8 × '😊' = 32 bytes, but only 8 UTF-16 code units
      await expect(
        hash('password', '😊'.repeat(8), 1000)
      ).resolves.toHaveLength(64);
    });

    it('rejects non-integer iteration counts', async () => {
      await expect(hash('password', SALT, 1000.5)).rejects.toThrow(RangeError);
    });

    it('rejects zero or negative iteration counts', async () => {
      await expect(hash('password', SALT, 0)).rejects.toThrow(RangeError);
      await expect(hash('password', SALT, -5)).rejects.toThrow(RangeError);
    });

    it('rejects excessively large iteration counts (DoS guard)', async () => {
      await expect(hash('password', SALT, 10_000_000)).rejects.toThrow(
        RangeError
      );
    });

    it('verify also rejects out-of-range iteration counts', async () => {
      const h = await hash('password', SALT, 1000);
      await expect(verify('password', SALT, h, 10_000_000)).rejects.toThrow(
        RangeError
      );
    });
  });
});
