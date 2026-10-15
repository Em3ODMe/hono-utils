/**
 * Generates a cryptographically strong random salt.
 */
export function generateSalt(length: number = 16): string {
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer));
}

/**
 * Calculates the SHA hash of the given input string.
 *
 * ⚠️ Security notes:
 * - This is a fast, general-purpose digest. Do NOT use it for password
 *   storage — fast hashes are trivial to brute-force. Use `PBKDF2.hash`
 *   instead, which is deliberately slow.
 * - `pepper` is NOT a MAC. The construction `hash(pepper + input)` is
 *   vulnerable to length-extension attacks with SHA-256 (the default) and
 *   SHA-512: anyone who sees the digest can append data and compute a valid
 *   hash without knowing the pepper. For secret-keyed authenticity
 *   (signatures, tokens, webhook verification) use `HMAC.sha256Hex` instead.
 *
 * @param algorithm - The algorithm to be used for hashing. Defaults to 256.
 * @param pepper - An optional string to be prepended to the input before hashing. Not suitable as a secret authentication key (see above).
 * @param salt - An optional string to be appended to the input before hashing.
 * @returns A Promise that resolves to the hashed string.
 */
export async function hash({
  input,
  algorithm = 'SHA-256',
  pepper,
  salt,
}: {
  input: string;
  algorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512';
  pepper?: string;
  salt?: string;
}): Promise<string> {
  let textToHash = input;
  if (pepper) {
    textToHash = `${pepper}${input}`;
  }
  if (salt) {
    textToHash = `${textToHash}${salt}`;
  }
  const buffer = new TextEncoder().encode(textToHash);
  const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedString = hashArray
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return hashedString;
}
