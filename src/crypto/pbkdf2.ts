/**
 * Bounds for the PBKDF2 iteration count. Values below 1 are invalid per the
 * Web Crypto spec; the upper bound guards against CPU denial-of-service when
 * the count is read from untrusted storage (e.g., a tampered DB record).
 */
const MIN_ITERATIONS = 1;
const MAX_ITERATIONS = 2_000_000;

/** Minimum salt length in bytes (after UTF-8 encoding). */
const MIN_SALT_BYTES = 16;

/**
 * Internal helper to derive raw cryptographic bits using the PBKDF2 algorithm.
 * * @internal
 * @param {string} input - The plain-text string (password/key) to be hashed.
 * @param {Uint8Array} salt - A cryptographically random salt. Recommended minimum 16 bytes.
 * @param {number} iterations - The number of iterations to perform. (e.g., 600,000).
 * @returns {Promise<Uint8Array>} A promise that resolves to the derived 256-bit key.
 * @throws {RangeError} If `iterations` is not an integer in [1, 2,000,000].
 * @throws {Error} If the crypto operation fails or parameters are invalid.
 */
async function deriveRawKey(
  input: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_ITERATIONS ||
    iterations > MAX_ITERATIONS
  ) {
    throw new RangeError(
      `iterations must be an integer between ${MIN_ITERATIONS} and ${MAX_ITERATIONS}`
    );
  }

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
      // Slice instead of using `.buffer` directly: if `salt` is a view over a
      // larger buffer, `.buffer` would silently include the extra bytes.
      salt: salt.buffer.slice(
        salt.byteOffset,
        salt.byteOffset + salt.byteLength
      ) as ArrayBuffer,
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
 * @param {string} salt - The salt string used to randomize the hash. Must be at least 16 bytes after UTF-8 encoding — use `SHA.generateSalt()` to create one.
 * @param {number} [iterations=600000] - The CPU cost factor. Default is 600,000. Must be an integer in [1, 2,000,000].
 * @returns {Promise<string>} A hex-encoded string representing the derived key.
 * @throws {RangeError} If the salt is shorter than 16 bytes or `iterations` is out of bounds.
 */
export async function hash(
  input: string,
  salt: string,
  iterations: number = 600000
): Promise<string> {
  const encoder = new TextEncoder();
  const saltBuffer = encoder.encode(salt);

  if (saltBuffer.byteLength < MIN_SALT_BYTES) {
    throw new RangeError(
      `salt must be at least ${MIN_SALT_BYTES} bytes after UTF-8 encoding (got ${saltBuffer.byteLength})`
    );
  }

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
 * @param {string} salt - The salt used during the original hashing. The 16-byte minimum is not enforced here so legacy records remain verifiable.
 * @param {string} storedHash - The hex-encoded hash previously stored in the database.
 * @param {number} iterations - The iteration count used for the original hash. Must be an integer in [1, 2,000,000]; out-of-range values throw rather than run, to block DoS via tampered records.
 * @returns {Promise<boolean>} Resolves to `true` if the input matches the hash, otherwise `false`.
 * @throws {RangeError} If `iterations` is out of bounds.
 */
export async function verify(
  input: string,
  salt: string,
  storedHash: string,
  iterations: number
): Promise<boolean> {
  // Guard against malformed stored hashes: `.match()` returns `null` for an
  // empty string, and odd-length or non-hex input would silently produce
  // `NaN` bytes during conversion.
  if (!/^[0-9a-fA-F]+$/.test(storedHash) || storedHash.length % 2 !== 0) {
    return false;
  }

  const encoder = new TextEncoder();
  const saltBuffer = encoder.encode(salt);

  // Generate the current hash
  const generatedBuffer = await deriveRawKey(input, saltBuffer, iterations);

  // Convert stored hex back to buffer for a pure byte-to-byte comparison
  const storedBuffer = new Uint8Array(
    (storedHash.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16))
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
