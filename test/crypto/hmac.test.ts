import { describe, expect, it } from 'vitest';
import { sha256Hex, timingSafeEqualHex, toHex } from '@/crypto/hmac';

// Reference vector: HMAC-SHA256 of "The quick brown fox jumps over the lazy dog"
// with key "key" (RFC 4231 test case 1, but with our lowercase-hex convention).
const RFC4231_KEY = 'key';
const RFC4231_DATA = 'The quick brown fox jumps over the lazy dog';
const RFC4231_HEX =
  'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8';

describe('sha256Hex', () => {
  it('matches the RFC 4231 reference vector', async () => {
    const hex = await sha256Hex(RFC4231_KEY, RFC4231_DATA);
    expect(hex).toBe(RFC4231_HEX);
  });

  it('produces different signatures for different secrets and bodies', async () => {
    const a = await sha256Hex('secret-a', 'body');
    const b = await sha256Hex('secret-b', 'body');
    const c = await sha256Hex('secret-a', 'other body');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('timingSafeEqualHex', () => {
  it('accepts equal hex strings regardless of case', () => {
    expect(timingSafeEqualHex(RFC4231_HEX, RFC4231_HEX)).toBe(true);
    expect(timingSafeEqualHex(RFC4231_HEX, RFC4231_HEX.toUpperCase())).toBe(
      true
    );
  });

  it('rejects different hex strings of equal and unequal length', () => {
    expect(
      timingSafeEqualHex(RFC4231_HEX, '0'.repeat(RFC4231_HEX.length))
    ).toBe(false);
    expect(timingSafeEqualHex(RFC4231_HEX, 'deadbeef')).toBe(false);
  });
});

describe('toHex', () => {
  it('hex-encodes an ArrayBuffer with zero padding', () => {
    const buffer = new Uint8Array([0x00, 0x0f, 0xff]).buffer;
    expect(toHex(buffer)).toBe('000fff');
  });
});
