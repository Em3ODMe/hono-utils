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
 * @param algorithm - The algorithm to be used for hashing. Defaults to 256.
 * @param pepper - An optional string to be prepended to the input before hashing.
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
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
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
