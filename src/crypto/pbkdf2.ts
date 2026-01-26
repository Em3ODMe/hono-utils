/**
 * Internal helper to derive raw cryptographic bits using the PBKDF2 algorithm.
 * * @internal
 * @param {string} input - The plain-text string (password/key) to be hashed.
 * @param {Uint8Array} salt - A cryptographically random salt. Recommended minimum 16 bytes.
 * @param {number} iterations - The number of iterations to perform. (e.g., 600,000).
 * @returns {Promise<Uint8Array>} A promise that resolves to the derived 256-bit key.
 * @throws {Error} If the crypto operation fails or parameters are invalid.
 */
async function deriveRawKey(
  input: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const encoder = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: iterations,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  return new Uint8Array(derivedBits);
}

/**
 * Derives a secure hex-encoded hash from an input string using PBKDF2-HMAC-SHA256.
 * * @example
 * const passwordHash = await hash("myPassword123", "random-salt-string");
 * * @param {string} input - The plain-text string to hash.
 * @param {string} salt - The salt string used to randomize the hash.
 * @param {number} [iterations=600000] - The CPU cost factor. Default is 600,000.
 * @returns {Promise<string>} A hex-encoded string representing the derived key.
 */
export async function hash(
  input: string,
  salt: string,
  iterations: number = 600000
): Promise<string> {
  const encoder = new TextEncoder();
  const saltBuffer = encoder.encode(salt);
  const hashBuffer = await deriveRawKey(input, saltBuffer, iterations);

  return Array.from(hashBuffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies if an input string matches a stored hash using a constant-time comparison.
 * This prevents timing attacks by ensuring the execution time does not reveal
 * how many characters of the hash were correct.
 * * @param {string} input - The plain-text string to verify.
 * @param {string} salt - The salt used during the original hashing.
 * @param {string} storedHash - The hex-encoded hash previously stored in the database.
 * @param {number} iterations - The iteration count used for the original hash.
 * @returns {Promise<boolean>} Resolves to `true` if the input matches the hash, otherwise `false`.
 */
export async function verify(
  input: string,
  salt: string,
  storedHash: string,
  iterations: number
): Promise<boolean> {
  const encoder = new TextEncoder();
  const saltBuffer = encoder.encode(salt);

  // Generate the current hash
  const generatedBuffer = await deriveRawKey(input, saltBuffer, iterations);

  // Convert stored hex back to buffer for a pure byte-to-byte comparison
  const storedBuffer = new Uint8Array(
    storedHash.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  // Constant-time comparison on bytes
  if (generatedBuffer.length !== storedBuffer.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < generatedBuffer.length; i++) {
    result |= generatedBuffer[i] ^ storedBuffer[i];
  }

  return result === 0;
}
