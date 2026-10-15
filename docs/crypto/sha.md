# Cryptographic Hashing Utilities

A set of lightweight utility functions for generating random salts and calculating one-way cryptographic hashes using the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). These are designed for scenarios requiring data integrity, such as verifying file contents or preparing strings for secure storage.

---

## Functions

### `generateSalt(length)`

Creates a cryptographically strong random salt encoded in Base64. It uses `crypto.getRandomValues()` to ensure the output is suitable for security-sensitive operations.

```typescript
import { SHA } from 'hono-utils/crypto';

const salt = SHA.generateSalt(32);
// Returns a Base64 string like: "4fG8zX..."
```

- **`length`**: The number of random bytes to generate (Default: `16`).
- **Returns**: A `string` (Base64 encoded).

---

### `hash(options)`

Calculates the digest of a string using SHA-2 family algorithms. It supports optional **peppering** (prefixing) and **salting** (suffixing).

#### Usage Example

```typescript
import { SHA } from 'hono-utils/crypto';

const secureHash = await SHA.hash({
  input: 'my-sensitive-data',
  algorithm: 'SHA-512',
  pepper: 'secret-environment-pepper', // Prepend
  salt: 'unique-user-salt', // Append
});
```

#### Parameters

| Property    | Type                                  | Default     | Description                      |
| ----------- | ------------------------------------- | ----------- | -------------------------------- |
| `input`     | `string`                              | —           | The raw string to be hashed.     |
| `algorithm` | `'SHA-256' \| 'SHA-384' \| 'SHA-512'` | `'SHA-256'` | The SHA-2 variant to use.        |
| `pepper`    | `string` (Optional)                   | `undefined` | A string prepended to the input. |
| `salt`      | `string` (Optional)                   | `undefined` | A string appended to the input.  |

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

## Security Notes

> [!WARNING]
> **Not for password storage.** `SHA.hash` is a fast, general-purpose digest and is trivial to brute-force. Use `PBKDF2.hash` instead, which is deliberately slow.

> [!WARNING]
> **`pepper` is not a MAC.** The construction `hash(pepper + input)` is vulnerable to length-extension attacks with SHA-256 (the default) and SHA-512: anyone who sees the digest can append data and compute a valid hash without knowing the pepper. For secret-keyed authenticity (signatures, tokens, webhook verification), use `HMAC.sha256Hex` instead.

> [!NOTE]
> While `hash()` is excellent for data integrity and simple hashing, for **password storage** it is recommended to use the [`PBKDF2`](pbkdf2.md) utility as it provides "key stretching" which is significantly more resistant to brute-force attacks than a standard single-round SHA-256 hash.
