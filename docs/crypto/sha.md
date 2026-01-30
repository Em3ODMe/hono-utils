# Cryptographic Hashing Utilities

A set of lightweight, secure utility functions for generating random salts and calculating one-way cryptographic hashes using the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). These are designed for scenarios requiring data integrity, such as verifying file contents or preparing strings for secure storage.

---

## Functions

### `generateSalt(length)`

Creates a cryptographically strong random salt encoded in Base64. It uses `crypto.getRandomValues()` to ensure the output is suitable for security-sensitive operations.

```typescript
import { generateSalt } from './crypto';

const salt = generateSalt(32);
// Returns a Base64 string like: "4fG8zX..."
```

- **`length`**: The number of random bytes to generate (Default: `16`).
- **Returns**: A `string` (Base64 encoded).

---

### `hash(options)`

Calculates the digest of a string using SHA-2 family algorithms. It supports optional **peppering** (prefixing) and **salting** (suffixing) to increase resistance against pre-computed attacks like Rainbow Tables.

#### Usage Example

```typescript
import { hash } from './crypto';

const secureHash = await hash({
  input: 'my-sensitive-data',
  algorithm: 'SHA-512',
  pepper: 'secret-environment-pepper', // Prepend
  salt: 'unique-user-salt', // Append
});
```

#### Parameters

| Property    | Type                | Default     | Description                             |
| ----------- | ------------------- | ----------- | --------------------------------------- | ----------- | ------------------------- |
| `input`     | `string`            | —           | The raw string to be hashed.            |
| `algorithm` | `SHA-256            | SHA-384     | SHA-512`                                | `'SHA-256'` | The SHA-2 variant to use. |
| `pepper`    | `string` (Optional) | `undefined` | A secret string prepended to the input. |
| `salt`      | `string` (Optional) | `undefined` | A string appended to the input.         |

**Returns**: `Promise<string>` (Hex-encoded).

---

## Implementation Details

### Salt vs. Pepper

This utility allows for both `salt` and `pepper` implementation:

- **Salt:** Usually unique per record and stored in the database alongside the hash.
- **Pepper:** Usually a single secret string stored in the application environment configuration (not the database).

### Internal Logic

The function concatenates the strings in the following order:
`[pepper][input][salt]`

The combined string is then converted to a `Uint8Array` via `TextEncoder` before being processed by `crypto.subtle.digest`.

---

> [!NOTE]
> While `hash()` is excellent for data integrity and simple hashing, for **password storage**, it is recommended to use the [`PBKDF2`](pbkdf2.md) utility as it provides "key stretching" which is significantly more resistant to brute-force attacks than a standard single-round SHA-256 hash.
