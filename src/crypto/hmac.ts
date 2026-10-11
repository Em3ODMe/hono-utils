/**
 * Worker-safe Web Crypto helpers for HMAC-SHA256 signing/verification.
 *
 * Shared by the webhook delivery pipeline (queue worker signs, clients verify)
 * and the Stripe webhook handler (Stripe signs, we verify). Web Crypto is used
 * so the code runs identically in Cloudflare Workers and Node 18+.
 */

/** ArrayBuffer → lowercase hex string. */
export const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/**
 * HMAC-SHA256 over `data` with `secret` (raw string key), hex-encoded.
 * This is the canonical signature format for webhook deliveries
 * (`X-ModuApps-Signature: sha256=<hex>`) and Stripe v1 signatures.
 */
export const sha256Hex = async (
  secret: string,
  data: string
): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

  return toHex(signature);
};

/**
 * Constant-time hex-string comparison (after lowercasing both sides).
 * Returns `false` immediately on length mismatch — lengths are not secret.
 */
export const timingSafeEqualHex = (a: string, b: string): boolean => {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
};
