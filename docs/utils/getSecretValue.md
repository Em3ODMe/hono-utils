# `getSecretValue` Utility

The `getSecretValue` function normalizes access to a secret that may be supplied either as a plain string or as a Cloudflare [Secrets Store](https://developers.cloudflare.com/secrets-store/) binding. It always resolves to the secret's plain-string value, so callers can treat both forms uniformly.

---

## Usage

```typescript
import { getSecretValue } from 'hono-utils';

// A secret read directly from the environment as a string
const fromString = await getSecretValue('my-secret-value');

// A Secrets Store binding (e.g. `env.API_KEY`)
const fromStore = await getSecretValue(env.API_KEY);
```

---

## API Reference

### `getSecretValue(value)`

| Parameter | Type                           | Description                                            |
| --------- | ------------------------------ | ------------------------------------------------------ |
| `value`   | `string \| SecretsStoreSecret` | The secret string or Secrets Store binding to resolve. |

**Returns:** `Promise<string>` — resolves to the secret's plain-string value.

When `value` is a `string` it is returned as-is. When it is a `SecretsStoreSecret`, the binding's asynchronous `get()` method is awaited.
