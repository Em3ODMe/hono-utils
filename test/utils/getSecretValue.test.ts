import { describe, expect, it, vi } from 'vitest';
import type { SecretsStoreSecret } from '@cloudflare/workers-types';
import { getSecretValue } from '@/utils/getSecretValue';

describe('getSecretValue', () => {
  it('returns a plain string as-is', async () => {
    await expect(getSecretValue('plain-secret')).resolves.toBe('plain-secret');
  });

  it('reads a Secrets Store binding via get()', async () => {
    const get = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue('stored-secret');
    const secret: SecretsStoreSecret = { get };

    await expect(getSecretValue(secret)).resolves.toBe('stored-secret');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('propagates a rejection from the Secrets Store binding', async () => {
    const get = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error('secret missing'));
    const secret: SecretsStoreSecret = { get };

    await expect(getSecretValue(secret)).rejects.toThrow('secret missing');
  });
});
