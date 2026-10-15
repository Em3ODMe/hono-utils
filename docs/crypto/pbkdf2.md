# Cryptographic Utilities (PBKDF2)

A collection of high-security functions for password hashing and verification using the **PBKDF2-HMAC-SHA256** algorithm. These utilities are built on the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), making them ideal for modern environments like Cloudflare Workers, Deno, and modern browsers.

---

## Features

- **Standardized Hashing:** Implements PBKDF2 with a SHA-256 HMAC for robust password derivation.
- **Constant-Time Verification:** Includes a secure comparison loop to prevent [timing attacks](https://en.wikipedia.org/wiki/Timing_attack).
- **Configurable Work Factor:** Allows adjustable iteration counts (defaulting to 600,000) to keep pace with evolving hardware performance.
- **Input Validation:** Rejects out-of-bounds iteration counts and malformed stored hashes to prevent CPU denial-of-service and silent corruption.
- **Zero External Dependencies:** Relies entirely on native platform APIs.

---

## Usage Example

### Hashing a Password

When a user signs up, generate a unique salt and hash their password before storage.

```typescript
import { PBKDF2, SHA } from 'hono-utils/crypto';

const password = 'user-secret-password';
const salt = SHA.generateSalt(); // Cryptographically secure random salt (>= 16 bytes)
const iterations = 600000;

const passwordHash = await PBKDF2.hash(password, salt, iterations);

// Store 'salt', 'iterations', and 'passwordHash' in your database
```

### Verifying a Password

On login, retrieve the salt and hash from the database to verify the user's input.

```typescript
import { PBKDF2 } from 'hono-utils/crypto';

const isMatch = await PBKDF2.verify(
  providedPassword,
  storedSalt,
  storedHash,
  storedIterations
);

if (isMatch) {
  // Proceed with login
}
```

---

## API Reference

### `hash(input, salt, iterations?)`

Derives a hex-encoded string from the input.

| Parameter    | Type     | Default  | Description                                                                                                  |
| ------------ | -------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `input`      | `string` | —        | The plain-text string (password) to hash.                                                                    |
| `salt`       | `string` | —        | A unique, random string per user. Must be at least 16 bytes after UTF-8 encoding — use `SHA.generateSalt()`. |
| `iterations` | `number` | `600000` | The number of hashing rounds. Must be an integer in `[1, 2_000_000]`.                                        |

**Returns:** `Promise<string>` (64-character hex string).

### `verify(input, salt, storedHash, iterations)`

Checks if an input matches a stored hash.

| Parameter    | Type     | Description                                                                             |
| ------------ | -------- | --------------------------------------------------------------------------------------- |
| `input`      | `string` | The plain-text password provided during login.                                          |
| `salt`       | `string` | The salt used during the original hash.                                                 |
| `storedHash` | `string` | The hex string retrieved from the database.                                             |
| `iterations` | `number` | The iteration count used for the original hash. Must be an integer in `[1, 2_000_000]`. |

**Returns:** `Promise<boolean>`. A malformed `storedHash` (empty, non-hex, or odd length) returns `false`.

---

## Implementation Details

### Timing Attack Mitigation

The `verify` function does not use standard string comparison (e.g., `===`). Instead, it performs a **Bitwise XOR** across the byte arrays:

```typescript
let result = 0;
for (let i = 0; i < generatedBuffer.length; i++) {
  result |= generatedBuffer[i] ^ storedBuffer[i];
}
return result === 0;
```

This ensures the function always takes the same amount of time to execute, regardless of how many bytes match, preventing attackers from guessing the hash character-by-character based on response latency.

### Input Validation

- `iterations` is rejected with a `RangeError` unless it is an integer in `[1, 2_000_000]`. The upper bound guards against CPU denial-of-service when the count is read from untrusted storage (e.g. a tampered DB record).
- `hash` requires a salt of at least 16 bytes after UTF-8 encoding. `verify` intentionally does **not** enforce the salt minimum so legacy records remain verifiable.

### Iteration Count

The default of **600,000 iterations** is aligned with current [OWASP recommendations](https://www.google.com/search?q=https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html%23pbkdf2) for PBKDF2-HMAC-SHA256 to ensure resistance against GPU-based brute-force attacks.

---

> [!WARNING]
> **Never reuse salts.** Every password should have its own unique, randomly generated salt stored alongside the hash to prevent Rainbow Table attacks.
