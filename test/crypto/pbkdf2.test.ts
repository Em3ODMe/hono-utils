import { describe, it, expect, beforeEach } from 'vitest';
import { hash, verify } from '@/crypto/pbkdf2';

describe('PBKDF2 Module', () => {
  beforeEach(() => {
    // No global setup required for now
  });

  describe('hash function', () => {
    it('produces 64-hex string with default iterations', async () => {
      const hex = await hash('password', 'salt');
      expect(typeof hex).toBe('string');
      expect(hex).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hex)).toBe(true);
    });

    it('is deterministic for identical inputs', async () => {
      const a = await hash('password', 'salt', 1000);
      const b = await hash('password', 'salt', 1000);
      expect(a).toBe(b);
    });

    it('produces different hashes with different salts', async () => {
      const h1 = await hash('password', 'salt1', 1000);
      const h2 = await hash('password', 'salt2', 1000);
      expect(h1).not.toBe(h2);
    });

    it('handles unicode passwords', async () => {
      const h = await hash('päßwörd😊', 'salt', 50000);
      expect(typeof h).toBe('string');
      expect(h).toHaveLength(64);
    });

    it('produces different hashes with different inputs', async () => {
      const h1 = await hash('password1', 'salt', 1000);
      const h2 = await hash('password2', 'salt', 1000);
      expect(h1).not.toBe(h2);
    });
  });

  describe('verify', () => {
    it('verifies correct password', async () => {
      const pass = 'correct horse battery staple';
      const salt = 'salt';
      const h = await hash(pass, salt, 1000);
      expect(await verify(pass, salt, h, 1000)).toBe(true);
    });

    it('fails for incorrect password', async () => {
      const pass = 'correct horse battery staple';
      const salt = 'salt';
      const h = await hash(pass, salt, 1000);
      expect(await verify('wrong password', salt, h, 1000)).toBe(false);
    });

    it('fails if salt differs', async () => {
      const pass = 'secret';
      const h = await hash('secret', 'salt', 1000);
      expect(await verify(pass, 'different_salt', h, 1000)).toBe(false);
    });

    it('fails if iteration count differs', async () => {
      const pass = 'secret';
      const salt = 'salt';
      const h = await hash(pass, salt, 1000);
      expect(await verify(pass, salt, h, 500)).toBe(false);
    });

    it('fails if partial hash matches (tests line 91 coverage)', async () => {
      const pass = 'secret';
      const salt = 'salt';
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
      const salt = 'salt';
      const h = await hash(pass, salt, 1000);

      // Shorten the hash to trigger length mismatch
      const shortHash = h.substring(0, 60);
      expect(await verify(pass, salt, shortHash, 1000)).toBe(false);
    });
  });
});
