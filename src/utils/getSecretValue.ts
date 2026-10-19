import type { SecretsStoreSecret } from '@cloudflare/workers-types';

/**
 * @description
 * Resolves a secret to its plain-string value. A `string` is returned as-is;
 * a Cloudflare Secrets Store binding is read via its `get()` method.
 *
 * @param value - The secret string or Secrets Store binding to resolve.
 * @returns A promise that resolves to the secret string.
 */
export const getSecretValue = async (
  value: string | SecretsStoreSecret
): Promise<string> => (typeof value === 'string' ? value : value.get());
