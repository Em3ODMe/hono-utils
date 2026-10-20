# hono-utils Knowledge Base

> Single consolidated reference for AI agents working with `hono-utils` — a
> TypeScript utility library for [Hono](https://hono.dev) (MIT licensed),
> Cloudflare Workers first. This file replaces the per-module `docs/` pages and
> is the canonical source for the library's public API. It ships with the npm
> package under `.agents/skills/hono-utils/`.

## Overview

| Entry point         | Import                                    | Contents                                                                                                              |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `hono-utils`        | `import { ... } from 'hono-utils'`        | All middleware, `QueueHandler`, router handlers (`onError`, `onNotFound`), utils (`formatZodError`, `getSecretValue`) |
| `hono-utils/crypto` | `import { ... } from 'hono-utils/crypto'` | `HMAC`, `PBKDF2`, `SHA`                                                                                               |
| `hono-utils/client` | `import { ... } from 'hono-utils/client'` | `createTypedClient`                                                                                                   |

- **Runtime**: Cloudflare Workers first, Node `>=18`. Library code uses Web
  Standard APIs (`Request`/`Response`, `crypto.subtle`, `Headers`, `URL`, ...).
- **Stack**: TypeScript (strict), Hono `^4`, Zod `4`, `ua-parser-js`,
  `hierarchical-area-logger`. `@cloudflare/workers-types` is a peer dependency.
- **Middleware order matters** (see [Cross-cutting notes](#cross-cutting-notes)):
  `logger` must be registered before `withLogger`, and before `clientInfo` /
  `isBot` / `queue` when they log or read `c.var.logger`. `i18n` requires a
  `language` variable set by middleware registered before it.

Module index:

- [Client](#client) — `createTypedClient`
- [Crypto](#crypto) — `HMAC`, `PBKDF2`, `SHA`
- [Middleware](#middleware) — `clientInfo`, `i18n`, `isBot`, `jsonValidator`,
  `queryValidator`, `logger`, `queue`, `response`, `withLogger`
- [Queue](#queue) — `QueueHandler`
- [Router](#router) — `onError`, `onNotFound`
- [Utils](#utils) — `formatZodError`, `getSecretValue`
- [Cross-cutting notes](#cross-cutting-notes)

---

# Client

## createTypedClient

`createTypedClient` acts as a **Client-Side Wrapper** (or interceptor) for Hono's RPC client (`hc`), adding lifecycle hooks and standardized error handling.

### Features

- **Full Type-Safety:** Leverages Hono's `hc` generics to ensure end-to-end type safety between server and client.
- **Lifecycle Callbacks:** Provides hooks for `onStart`, `onSuccess`, `onError`, and `onEnd` to easily manage UI states (e.g., loading spinners, global toast notifications).
- **Automated Parsing:** Uses Hono's `parseResponse` to automatically handle JSON/Text parsing and validate `response.ok`.
- **Standardized Error Handling:** Catches fetch errors and non-200 responses, normalizing them into `HTTPException` objects.
- **Dynamic Headers:** Supports both static headers and async functions for dynamic header injection (e.g., retrieving fresh auth tokens).

### Usage

#### 1. Define Types

First, ensure you have exported the type of your Hono application from your server file. This allows the client to infer routes and return types.

```typescript
// server.ts
import { Hono } from 'hono';

const app = new Hono()
  .get('/users', (c) => c.json([{ id: 1, name: 'Alice' }]))
  .post('/users', (c) => c.json({ success: true }));

// Export the type of the app
export type AppType = typeof app;
export default app;
```

#### 2. Apply Wrapper

Create the RPC client with `createTypedClient<AppType>()(options)`, then call it with a function that performs the request using the raw `hc` client. Lifecycle callbacks are passed as the second argument.

```typescript
// client.ts
import { createTypedClient } from 'hono-utils/client';
import type { AppType } from './server'; // Import type from server

// Initialize the client
const rpcClient = createTypedClient<AppType>()({
  url: 'http://localhost:3000',
  headers: {
    Authorization: 'Bearer token...',
  },
});

// Usage example inside a function
async function getUsers() {
  try {
    // First argument: a function that uses the raw 'client'
    // Second argument (optional): lifecycle callbacks
    const users = await rpcClient((client) => client.users.$get(), {
      onStart: () => console.log('Fetching...'),
      onSuccess: (data, headers) => console.log('Done!', data),
      onError: (data, headers) => console.error('Failed', data),
      onEnd: () => console.log('Request finished'),
    });
    console.log(users);
  } catch (error) {
    // Errors are thrown as HTTPExceptions
    console.error('API Error:', error);
  }
}
```

### Configuration

The `createTypedClient` function returns a factory that accepts an options object:

| Property           | Type                                                                                                  | Description                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **`url`**          | `string`                                                                                              | The base URL of your Hono server.                                                 |
| **`headers`**      | `Record<string, string>` \| `() => Record<string, string>` \| `() => Promise<Record<string, string>>` | Static headers or a (possibly async) function for dynamic headers.                |
| **`fetch`**        | `typeof fetch`                                                                                        | (Optional) Custom fetch implementation (e.g., for Node.js environments).          |
| **`errorHandler`** | `(status, body?) => never`                                                                            | (Optional) Called before an error is thrown, with the status code and error body. |

The returned RPC client accepts:

1. **`fn`** — a function receiving the raw `hc` client and returning a `ClientResponse`.
2. **`callbacks`** (Optional) — lifecycle hooks.

#### Callback Interfaces

The `callbacks` object supports the following methods:

- **`onStart()`**: Triggered immediately before the request is made.
- **`onSuccess(parsedData, headers)`**: Triggered after successful parsing and a 2xx status code.
- **`onError(parsedData, headers)`**: Triggered when a `DetailedError` occurs (i.e. a non-2xx response with a parsed body).
- **`onEnd()`**: Triggered inside the `finally` block (runs regardless of success or failure).

### Technical Considerations

- **Hono Client (`hc`) Dependency:** This wrapper relies on `hono/client`. It specifically uses `parseResponse`, which automatically throws a `DetailedError` if the response status is not in the 200 range.
- **Exception Propagation:**
  - If the fetch fails or returns a 4xx/5xx error, the wrapper catches the internal `DetailedError`.
  - It then re-throws a standard **`HTTPException`**. This allows you to use `try/catch` blocks in your UI logic to handle specific status codes (e.g., redirecting on 401).
- **Header Handling:** The wrapper captures response headers and passes them to both `onSuccess` and `onError` callbacks, allowing you to read metadata (like pagination or rate limits) from headers even on failure.
- **Malformed Responses:** If the server returns an error without a detail body (or if parsing fails completely), the wrapper creates a generic `500 Fetch malformed` error to prevent silent failures.

---

# Crypto

All crypto utilities live under the `hono-utils/crypto` entry point and are
built on the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), so they run identically on Cloudflare Workers, Deno, Bun, modern browsers, and Node 18+.

## HMAC

HMAC-SHA256 signing helpers, worker-safe. Shared by webhook delivery pipelines
(signer signs, clients verify) and Stripe-style webhook verification.

### `HMAC.sha256Hex(secret, data)`

Computes an HMAC-SHA256 over `data` using the raw string `secret`, returned as
a lowercase hex string. This is the canonical signature format for webhook
deliveries (`X-<Service>-Signature: sha256=<hex>`) and Stripe v1 signatures.

| Parameter | Type     | Description                                   |
| --------- | -------- | --------------------------------------------- |
| `secret`  | `string` | The raw secret key (imported as an HMAC key). |
| `data`    | `string` | The message/payload to sign.                  |

**Returns:** `Promise<string>` — lowercase hex-encoded signature.

```typescript
import { HMAC } from 'hono-utils/crypto';

const signature = await HMAC.sha256Hex(env.WEBHOOK_SECRET, payload);
```

### `HMAC.timingSafeEqualHex(a, b)`

Constant-time comparison of two hex strings (case-insensitive). Returns
`false` immediately on length mismatch — lengths are not secret. Use it to
verify a received signature; never compare signatures with `===`.

### `HMAC.toHex(buffer)`

Converts an `ArrayBuffer` to a lowercase hex string.

## PBKDF2

High-security functions for password hashing and verification using the
**PBKDF2-HMAC-SHA256** algorithm.

### Features

- **Standardized Hashing:** Implements PBKDF2 with a SHA-256 HMAC for robust password derivation.
- **Constant-Time Verification:** Includes a secure comparison loop to prevent [timing attacks](https://en.wikipedia.org/wiki/Timing_attack).
- **Configurable Work Factor:** Allows adjustable iteration counts (defaulting to 600,000) to keep pace with evolving hardware performance.
- **Input Validation:** Rejects out-of-bounds iteration counts and malformed stored hashes to prevent CPU denial-of-service and silent corruption.
- **Zero External Dependencies:** Relies entirely on native platform APIs.

### Usage Example

#### Hashing a Password

When a user signs up, generate a unique salt and hash their password before storage.

```typescript
import { PBKDF2, SHA } from 'hono-utils/crypto';

const password = 'user-secret-password';
const salt = SHA.generateSalt(); // Cryptographically secure random salt (>= 16 bytes)
const iterations = 600000;

const passwordHash = await PBKDF2.hash(password, salt, iterations);

// Store 'salt', 'iterations', and 'passwordHash' in your database
```

#### Verifying a Password

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

### API Reference

#### `hash(input, salt, iterations?)`

Derives a hex-encoded string from the input.

| Parameter    | Type     | Default  | Description                                                                                                  |
| ------------ | -------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `input`      | `string` | —        | The plain-text string (password) to hash.                                                                    |
| `salt`       | `string` | —        | A unique, random string per user. Must be at least 16 bytes after UTF-8 encoding — use `SHA.generateSalt()`. |
| `iterations` | `number` | `600000` | The number of hashing rounds. Must be an integer in `[1, 2_000_000]`.                                        |

**Returns:** `Promise<string>` (64-character hex string).

#### `verify(input, salt, storedHash, iterations)`

Checks if an input matches a stored hash.

| Parameter    | Type     | Description                                                                             |
| ------------ | -------- | --------------------------------------------------------------------------------------- |
| `input`      | `string` | The plain-text password provided during login.                                          |
| `salt`       | `string` | The salt used during the original hash.                                                 |
| `storedHash` | `string` | The hex string retrieved from the database.                                             |
| `iterations` | `number` | The iteration count used for the original hash. Must be an integer in `[1, 2_000_000]`. |

**Returns:** `Promise<boolean>`. A malformed `storedHash` (empty, non-hex, or odd length) returns `false`.

### Implementation Details

#### Timing Attack Mitigation

The `verify` function does not use standard string comparison (e.g., `===`). Instead, it performs a **Bitwise XOR** across the byte arrays:

```typescript
let result = 0;
for (let i = 0; i < generatedBuffer.length; i++) {
  result |= generatedBuffer[i] ^ storedBuffer[i];
}
return result === 0;
```

This ensures the function always takes the same amount of time to execute, regardless of how many bytes match, preventing attackers from guessing the hash character-by-character based on response latency.

#### Input Validation

- `iterations` is rejected with a `RangeError` unless it is an integer in `[1, 2_000_000]`. The upper bound guards against CPU denial-of-service when the count is read from untrusted storage (e.g. a tampered DB record).
- `hash` requires a salt of at least 16 bytes after UTF-8 encoding. `verify` intentionally does **not** enforce the salt minimum so legacy records remain verifiable.

#### Iteration Count

The default of **600,000 iterations** is aligned with current [OWASP recommendations](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2) for PBKDF2-HMAC-SHA256 to ensure resistance against GPU-based brute-force attacks.

> [!WARNING]
> **Never reuse salts.** Every password should have its own unique, randomly generated salt stored alongside the hash to prevent Rainbow Table attacks.

## SHA

Lightweight utility functions for generating random salts and calculating one-way cryptographic hashes, for scenarios requiring data integrity (verifying file contents, preparing strings for secure storage).

### Functions

#### `generateSalt(length)`

Creates a cryptographically strong random salt encoded in Base64. It uses `crypto.getRandomValues()` to ensure the output is suitable for security-sensitive operations.

```typescript
import { SHA } from 'hono-utils/crypto';

const salt = SHA.generateSalt(32);
// Returns a Base64 string like: "4fG8zX..."
```

- **`length`**: The number of random bytes to generate (Default: `16`).
- **Returns**: A `string` (Base64 encoded).

#### `hash(options)`

Calculates the digest of a string using SHA-2 family algorithms. It supports optional **peppering** (prefixing) and **salting** (suffixing).

```typescript
import { SHA } from 'hono-utils/crypto';

const secureHash = await SHA.hash({
  input: 'my-sensitive-data',
  algorithm: 'SHA-512',
  pepper: 'secret-environment-pepper', // Prepend
  salt: 'unique-user-salt', // Append
});
```

| Property    | Type                                  | Default     | Description                      |
| ----------- | ------------------------------------- | ----------- | -------------------------------- |
| `input`     | `string`                              | —           | The raw string to be hashed.     |
| `algorithm` | `'SHA-256' \| 'SHA-384' \| 'SHA-512'` | `'SHA-256'` | The SHA-2 variant to use.        |
| `pepper`    | `string` (Optional)                   | `undefined` | A string prepended to the input. |
| `salt`      | `string` (Optional)                   | `undefined` | A string appended to the input.  |

**Returns**: `Promise<string>` (Hex-encoded).

### Implementation Details

#### Salt vs. Pepper

This utility allows for both `salt` and `pepper` implementation:

- **Salt:** Usually unique per record and stored in the database alongside the hash.
- **Pepper:** Usually a single secret string stored in the application environment configuration (not the database).

#### Internal Logic

The function concatenates the strings in the following order:
`[pepper][input][salt]`

The combined string is then converted to a `Uint8Array` via `TextEncoder` before being processed by `crypto.subtle.digest`.

### Security Notes

> [!WARNING]
> **Not for password storage.** `SHA.hash` is a fast, general-purpose digest and is trivial to brute-force. Use [`PBKDF2.hash`](#pbkdf2) instead, which is deliberately slow.

> [!WARNING]
> **`pepper` is not a MAC.** The construction `hash(pepper + input)` is vulnerable to length-extension attacks with SHA-256 (the default) and SHA-512: anyone who sees the digest can append data and compute a valid hash without knowing the pepper. For secret-keyed authenticity (signatures, tokens, webhook verification), use [`HMAC.sha256Hex`](#hmac) instead.

> [!NOTE]
> While `hash()` is excellent for data integrity and simple hashing, for **password storage** use [`PBKDF2`](#pbkdf2), which provides "key stretching" that is significantly more resistant to brute-force attacks than a standard single-round SHA-256 hash.

---

# Middleware

All middleware is exported from the main `hono-utils` entry point.

## clientInfo

The `clientInfo` middleware is a robust utility designed to run on **Cloudflare Workers**. It aggregates geolocation data from Cloudflare's edge, parses complex User-Agent strings, and optionally generates a security hash for session integrity or bot detection.

### Features

- **Geolocation Extraction:** Automatically retrieves city, country, coordinates, and timezone from `req.raw.cf`.
- **User-Agent Parsing:** Utilizes `ua-parser-js` to break down the browser, OS, device type, and CPU architecture.
- **Custom Security Hash:** Generates a `securityHash` via a user-supplied `createSecurityHashString` callback (defaults to `'unset'` when not provided).
- **Hono Integration:** Injects all data into the Hono context (`c.get('client')`) with full TypeScript support.
- **Optional Logging:** With `useLogger: true`, writes debug/info entries to the `middleware:clientInfo` area via [`withLogger`](#withlogger).

### Usage

#### 1. Define Types

To ensure type safety across your application, include `HonoClientInfoVariables` in your Hono instance definition.

```typescript
import { Hono } from 'hono';
import { clientInfo, type HonoClientInfoVariables } from 'hono-utils';

type Bindings = {
  HASH_SECRET: string; // Required by the middleware
};

const app = new Hono<{
  Bindings: Bindings;
  Variables: HonoClientInfoVariables;
}>();
```

#### 2. Apply Middleware

Register the middleware globally or on specific routes.

```typescript
app.use('*', clientInfo());

app.get('/debug', (c) => {
  const client = c.get('client');

  return c.json({
    message: `Hello user from ${client.city}!`,
    device: client.device.type, // e.g., "mobile" or "desktop"
    isEU: client.isEUCountry,
    securityHash: client.securityHash,
  });
});
```

#### 3. Logging

Pass `useLogger: true` to log through the request logger. Logs are scoped to the `middleware:clientInfo` area, and the `logger` middleware must be registered first (otherwise `withLogger` throws).

```typescript
import { logger, clientInfo } from 'hono-utils';

app.use('*', logger({ details: { instance: 'api' } }));

app.use('*', clientInfo({ useLogger: true }));
```

### Configuration

The `clientInfo` function accepts an optional configuration object:

| Option                     | Type                                     | Default         | Description                                                                                                                                                              |
| -------------------------- | ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useLogger`                | `boolean`                                | `undefined`     | When `true`, writes debug/info entries to the `middleware:clientInfo` area via `withLogger`. Requires the `logger` middleware to be registered first (throws otherwise). |
| `hashSecretBinding`        | `string`                                 | `'HASH_SECRET'` | The key in your `env` that holds the hash secret. The middleware throws if it is missing.                                                                                |
| `createSecurityHashString` | `(content, bindings) => Promise<string>` | `undefined`     | A custom async callback that returns the `securityHash` value. When omitted, `securityHash` is set to `'unset'`.                                                         |

#### Custom Security Hash Example

```typescript
app.use(
  clientInfo({
    createSecurityHashString: async (data, bindings) => {
      const secret = bindings.HASH_SECRET;
      // Return any string you like (e.g. an HMAC/SHA digest of the fields).
      return `${data.ip}-${data.asn}-${data.device.model}`;
    },
  })
);
```

### Data Schema

The `client` object injected into the context contains three main categories of data:

#### 1. Geolocation (`CFData`)

Extracted directly from the Cloudflare edge request.

- **Location:** `city`, `country`, `continent`, `region`, `timezone`.
- **Network:** `asn`, `colo` (Cloudflare Data Center), `ip`.
- **Coordinates:** `latitude`, `longitude`.

#### 2. Device Information (`UserAgentData`)

Parsed from the `User-Agent` header.

- **Browser/Engine:** Name and version (e.g., Chrome, WebKit).
- **OS/CPU:** System name, version, and architecture (e.g., x64).
- **Device:** Vendor (Apple), Model (iPhone), and Type (mobile/desktop).

#### 3. Metadata

- **`userAgent`:** The raw, unparsed User-Agent string.
- **`securityHash`:** The value returned by `createSecurityHashString`, or `'unset'` when no callback is provided. Use it to verify whether client attributes have changed during a session.

### Technical Considerations

> [!IMPORTANT]
> **Cloudflare Environment:** This middleware relies on the `req.raw.cf` object and the `CF-Connecting-IP` header, which are only populated when running on the Cloudflare Workers runtime. It will throw an error if either is unavailable (e.g. in Node.js or Bun without a Cloudflare proxy). It also throws if the `HASH_SECRET` binding is not present in the environment.

> [!TIP]
> **Security Hash Stability:** The security hash is fully controlled by your `createSecurityHashString` callback. If you want a stable "sticky" session identifier, avoid including volatile fields like the client IP (which changes when users switch between Wi-Fi and cellular).

## i18n

The `i18n` utility is a lightweight internationalization factory for **Hono** applications and background tasks (like Cloudflare Queues). It provides a type-safe translation function `t()` that supports nested keys, variable interpolation, and automatic language fallbacks.

### Features

- **Nested Key Resolution:** Access translations using dot notation (e.g., `errors.auth.invalid_password`).
- **Variable Interpolation:** Inject dynamic values into strings using `{{variable}}` syntax.
- **Contextual Flexibility:** Includes both a Hono middleware and a standalone `queue` factory for non-request environments.
- **Fallback Logic:** Automatically reverts to a `defaultLanguage` if a key is missing in the requested locale.
- **TypeScript Optimized:** Infers translation shapes so `t()` accepts a union of dot-notated keys (e.g. `'auth.login' | 'welcome'`) and autosuggests them in your editor, preventing missing key errors during development.

### Quick Start

#### 1. Prepare Translations

Define your dictionary with a consistent structure across languages.

```typescript
const translations = {
  en: {
    welcome: 'Hello, {{name}}!',
    auth: { login: 'Sign in' },
  },
  pl: {
    welcome: 'Witaj, {{name}}!',
    auth: { login: 'Zaloguj się' },
  },
};
```

#### 2. Integration with Hono

The middleware requires a `language` variable to be set in the context _before_ it is executed.

```typescript
import { Hono } from 'hono';
import { i18n } from 'hono-utils';

const app = new Hono();

// 1. Set language (e.g., based on headers or cookies)
app.use('*', async (c, next) => {
  c.set('language', 'en');
  await next();
});

// 2. Register i18n middleware
const { middleware } = i18n(translations, 'en');
app.use('*', middleware);

// 3. Use in routes
app.get('/', (c) => {
  const message = c.var.t('welcome', { name: 'User' });
  return c.text(message); // "Hello, User!"
});
```

### API Reference

#### `i18n(translations, defaultLanguage)`

The main factory function.

- **`translations`**: An object containing your language keys.
- **`defaultLanguage`**: The fallback locale (e.g., `'en'`).

#### `t(input, params?, overrideLanguage?)`

The translation function injected into `c.var.t` or returned by the queue factory.

| Argument           | Type                                      | Description                                                   |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| `input`            | `I18nKey<T>` (union of dot-notated paths) | The dot-notated path to the translation (e.g., `'nav.home'`). |
| `params`           | `Record<string, string \| number>`        | Optional object for `{{key}}` interpolation.                  |
| `overrideLanguage` | `keyof T`                                 | Optional locale to use for this specific call only.           |

#### `queue(language?)`

A factory for using translations outside of the HTTP request lifecycle (e.g., in CRON jobs or Queues).

```typescript
const { queue } = i18n(translations, 'en');
const t = queue('pl');
console.log(t('welcome', { name: 'Admin' })); // "Witaj, Admin!"
```

### Type-Safe Keys

The `t()` function's first argument is derived from your translations object as a union of dot-notated keys, so invalid keys are caught at compile time and your editor autosuggests available keys.

```typescript
type Keys = I18nKey<typeof translations>;
// 'welcome' | 'auth.login'
```

When you need to type the Hono context manually (for example, in a `createMiddlewareTester` or a split `Env` type), use `HonoI18nVariables<T>`:

```typescript
import type { HonoI18nVariables, HonoLanguageVariables } from 'hono-utils';

type Env = {
  Variables: HonoI18nVariables<typeof translations> & HonoLanguageVariables;
};
```

### Technical Details

#### Key Resolution Logic

The utility resolves keys by looking up the **whole dot-notated path** first in the active (or override) language, and then—if not found—the same whole path in the `defaultLanguage`. Falling back per path segment would resolve nested keys against the wrong subtree of the default language, so the fallback happens once, for the complete path. If neither language contains the key, it returns the raw `input` string as a safety fallback.

#### Variable Interpolation

Interpolation replaces `{{key}}` placeholders. Each key is escaped before being used in a `RegExp`, so keys containing RegExp metacharacters do not over-match:

```typescript
const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
acc.replace(new RegExp(`{{${escapedKey}}}`, 'g'), params[key].toString());
```

> [!CAUTION]
> **Middleware Order:** The `i18n` middleware will throw an Error if `c.var.language` is undefined. Ensure your language detection middleware (cookies, `Accept-Language` header, etc.) runs before this middleware.

## isBot

The `isBot` middleware provides a security layer for **Hono** applications running on Cloudflare Workers. It leverages [Cloudflare Bot Management](https://developers.cloudflare.com/bots/concepts/bot-score/) scores to identify, tag, and optionally block automated traffic before it reaches your expensive API endpoints or database logic.

### Features

- **Score-Based Filtering:** Uses Cloudflare's 1–100 bot score to determine request legitimacy.
- **Verified Bot Pass:** Optionally allows known "good bots" (like Googlebot or Bingbot) to bypass blocks regardless of score.
- **Contextual Tagging:** Sets an `isBot` boolean in the Hono context for downstream logging or logic.
- **Automatic Blocking:** Immediately throws an `HTTPException (401)` if a request fails the security criteria.
- **Optional Logging:** With `useLogger: true`, writes debug/info entries to the `middleware:isBot` area via [`withLogger`](#withlogger).

### Usage

#### 1. Application Setup

Add the `HonoIsBotVariables` to your Hono instance to ensure `c.get('isBot')` is typed correctly.

```typescript
import { Hono } from 'hono';
import { isBot, type HonoIsBotVariables } from 'hono-utils';

const app = new Hono<{ Variables: HonoIsBotVariables }>();
```

#### 2. Implementation Examples

**Strict Security (High Threshold)**
Block anything that Cloudflare isn't highly confident is a human.

```typescript
app.use(
  '/api/secure/*',
  isBot({
    threshold: 80,
  })
);
```

**Permissive Tagging**
Don't block, but identify bots for analytics (Set threshold to 0).

```typescript
app.use('*', isBot({ threshold: 0 }));

app.get('/data', (c) => {
  const isBot = c.get('isBot');
  return c.json({ info: 'Data', detectedAsBot: isBot });
});
```

#### 3. Logging

Pass `useLogger: true` to log through the request logger. Logs are scoped to the `middleware:isBot` area, and the `logger` middleware must be registered first (otherwise `withLogger` throws).

```typescript
import { logger, isBot } from 'hono-utils';

app.use('*', logger({ details: { instance: 'api' } }));

app.use('/api/secure/*', isBot({ threshold: 80, useLogger: true }));
```

### Configuration

| Option             | Type      | Default     | Description                                                                                                                                                         |
| ------------------ | --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `threshold`        | `number`  | `49`        | Scores **below** this value are flagged as bots. (1 = definitely bot, 100 = definitely human).                                                                      |
| `allowVerifiedBot` | `boolean` | `undefined` | If `true`, bots recognized by Cloudflare's verified list (search engines, etc.) are permitted even if their score is low.                                           |
| `useLogger`        | `boolean` | `undefined` | When `true`, writes debug/info entries to the `middleware:isBot` area via `withLogger`. Requires the `logger` middleware to be registered first (throws otherwise). |

### How It Works

Cloudflare provides a `botManagement` object within the request's `cf` properties. This middleware evaluates that metadata based on the following logic:

1. **Score Retrieval:** It looks for `cf.botManagement`. If unavailable (e.g. in local development without a Cloudflare proxy), the middleware throws an error. Otherwise, `cf.botManagement.score` is used (falling back to `54` if the score is `undefined`).
2. **Verification Check:** It checks if the bot is a known, "good" bot (e.g., a search engine crawler).
3. **Enforcement:**

- If the score is below your `threshold` **AND** it is not a `verifiedBot` (when verified bots are allowed), the middleware throws a `401 Unauthorized` error.
- Otherwise, the request is allowed to proceed, and the `isBot` variable is updated in the context.

> [!TIP]
> **Environment Context:** When running locally (e.g., using `wrangler dev`), the `cf` object is simulated. Ensure you are testing in an environment where bot scores are actively generated to see the middleware in action.

## jsonValidator

The `jsonValidator` is a specialized middleware for **Hono** that utilizes **Zod** to enforce strict schema validation on incoming JSON request bodies. It acts as a gatekeeper, ensuring that your route handlers only receive data that is structurally sound and type-safe.

### Features

- **Type-Safe Payloads:** Automatically infers the TypeScript type of your request body based on the Zod schema.
- **Compact Errors:** Uses `formatZodError` to return human-readable validation issues as a `prop: message` list instead of raw JSON error arrays.
- **Automatic Rejection:** Immediately terminates requests with a `400 Bad Request` if they do not match the expected schema.
- **Seamless Hono Integration:** Built on top of Hono's native `validator` utility for native performance and compatibility.

### Usage

#### 1. Define and Apply Schema

Define your Zod schema and pass it to the `jsonValidator` within your route definition.

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonValidator } from 'hono-utils';

const app = new Hono();

const UserSchema = z.object({
  name: z.string().min(2),
  age: z.number().int().positive(),
  email: z.string().email(),
});

app.post('/user', jsonValidator(UserSchema), (c) => {
  // Accessing validated data is fully typed
  const { name, age, email } = c.req.valid('json');

  return c.json({ success: true, user: name });
});
```

### API Reference

#### `jsonValidator(schema)`

| Parameter | Type          | Description                                                                              |
| --------- | ------------- | ---------------------------------------------------------------------------------------- |
| `schema`  | `z.ZodObject` | The Zod schema against which the `JSON.parse()` result of the request body is validated. |

### Error Handling

When validation fails, the middleware throws a `hono/http-exception`. By default, the client receives a **400 status code**.

#### Example Error Response

If a user submits a string for an `age` field that expects a number, the response will look like this:

```json
{
  "message": "age: Expected number, received string"
}
```

> [!TIP]
> **Compact Errors:** This middleware uses `formatZodError(parsed.error)`, which formats each issue as `path: message`. This is particularly useful for frontend developers because it converts Zod's complex nested error objects into a concise, readable string.

### Technical Details

#### Validation Lifecycle

1. **Extraction:** The middleware intercepts the request before it reaches the handler.
2. **Parsing:** It attempts to parse the JSON body and runs it through `schema.safeParse()`.
3. **Branching:**

- **Success:** The validated data is attached to the Hono request context via `c.req.valid('json')`.
- **Failure:** An `HTTPException` is thrown, halting further execution and returning the validation error message to the client.

#### Schema Requirements

The middleware expects a `ZodObject`. While Zod supports primitives (like `z.string()`), standard JSON API design generally requires the top-level body to be an object (`{}`).

## queryValidator

Zod validation for **query string parameters**, built on Hono's native `validator` for the `query` target. It mirrors [`jsonValidator`](#jsonvalidator): failures throw an `HTTPException` with status `400` and a message formatted by [`formatZodError`](#formatzoderror).

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { queryValidator } from 'hono-utils';

app.get(
  '/user',
  queryValidator(
    z.object({
      name: z.string(),
      age: z.coerce.number(),
    })
  ),
  (c) => {
    const { name, age } = c.req.valid('query'); // fully typed
    return c.json({ name, age });
  }
);
```

### `queryValidator(schema)`

| Parameter | Type          | Description                                                   |
| --------- | ------------- | ------------------------------------------------------------- |
| `schema`  | `z.ZodObject` | The Zod schema validated against the parsed query parameters. |

> [!TIP]
> Use `z.coerce.*` for query values, which always arrive as strings.

## logger

The `logger` middleware integrates the [`hierarchical-area-logger`](https://github.com/Em3ODMe/hierarchical-area-logger) into **Hono**, providing a structured, context-aware logging system. It automatically handles **Distributed Tracing** by managing parent/child event IDs and tagging logs with the specific request path (Area).

### Features

- **Distributed Tracing:** Extracts parent Event IDs from request headers to maintain a trace across microservices.
- **Automatic Area Tagging:** Uses the request's URL pathname as the default `Area`, allowing you to filter logs by specific API endpoints easily.
- **Contextual Injection:** Attaches a unique `logger` instance and `eventId` to the Hono context for use in handlers.
- **Structured Metadata:** Injects global service details (e.g., service name, environment) into every log entry.
- **Environment-driven configuration:** Every option can be resolved per request from runtime bindings (`c.env`) and from context variables set by middleware registered before the logger.
- **Tracing Response Header:** Returns the request `eventId` to the client through a response header (`eventIdHeader`, defaults to `x-event-id`), so client error reports can be correlated with server logs.

### Usage

#### 1. Basic Setup

Add the `HonoLoggerVariables` to your Hono instance and apply the middleware.

```typescript
import { Hono } from 'hono';
import { logger, type HonoLoggerVariables } from 'hono-utils';

const app = new Hono<{ Variables: HonoLoggerVariables }>();

app.use(
  '*',
  logger({
    details: { instance: 'api-gateway', service: 'api' },
  })
);
```

#### 2. Using the Logger in Routes

Access the logger via `c.var.logger` and log through a scoped area, automatically tied to the current request.

```typescript
app.get('/users/:id', async (c) => {
  const area = c.var.logger.getArea('users');

  area.info('Fetching user data', { userId: c.req.param('id') });

  // ... logic

  return c.json({ success: true });
});
```

### Configuration

| Parameter             | Type                                                                                           | Description                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `details`             | `Details \| (context) => Details \| Promise<Details>`                                          | Metadata attached to every log entry. May be resolved per request from bindings.                            |
| `parentEventIdHeader` | `string` (Optional)                                                                            | The name of the incoming header (e.g., `x-trace-id`) used to link logs to a parent process.                 |
| `createEventId`       | `(details, context) => string \| Promise<string>` (Optional)                                   | Factory that creates the event ID for the logging session. Defaults to `crypto.randomUUID()`. May be async. |
| `dumpOptions`         | `DumpLoggerOptions \| (context) => DumpLoggerOptions \| Promise<DumpLoggerOptions>` (Optional) | Default options applied on every `logger.dump()` (`omitRoot`, `finalizeLog`, `excludeLogTypes`).            |
| `eventIdHeader`       | `string` (Optional)                                                                            | Response header name that carries the request `eventId` back to the client. Defaults to `x-event-id`.       |

Any option that accepts a factory (function) is **re-evaluated on every request**, which is the recommended way to configure the logger from the environment. The factory receives a resolve context:

| Context field | Type             | Description                                                           |
| ------------- | ---------------- | --------------------------------------------------------------------- |
| `bindings`    | `E['Bindings']`  | The runtime bindings of the current request (`c.env`).                |
| `variables`   | `E['Variables']` | Context variables set by middleware registered **before** the logger. |

> [!IMPORTANT]
> **Middleware Order:** Resolvers can only read variables that were set by middleware registered _before_ `logger` (Hono middleware runs in registration order). Register `logger` after the middleware that provides the variables it depends on.

#### Environment-driven Configuration

```typescript
app.use(
  '*',
  logger({
    details: ({ bindings }) => ({
      instance: 'api-gateway',
      environment: bindings.ENVIRONMENT,
    }),
    dumpOptions: ({ bindings }) =>
      bindings.ENVIRONMENT === 'production'
        ? { excludeLogTypes: ['debug'] } // drop debug logs in production
        : {},
  })
);
```

#### Variables-driven Configuration

```typescript
// Set the language before the logger
app.use('*', async (c, next) => {
  c.set('language', 'en');
  await next();
});

app.use(
  '*',
  logger({
    details: { instance: 'api-gateway' },
    dumpOptions: ({ variables }) =>
      variables.traceEnabled ? { finalizeLog: false } : {},
  })
);
```

#### Custom Event IDs

```typescript
app.use(
  '*',
  logger({
    details: { instance: 'api-gateway' },
    // May be async
    createEventId: async (details, { bindings }) =>
      `${bindings.ENVIRONMENT}-${details.instance}-${crypto.randomUUID()}`,
  })
);
```

#### Tracing Response Header

The `logger` middleware returns the request `eventId` to the client via the `x-event-id` response header, so a failing request can be correlated with its logs. Override the header name with `eventIdHeader`:

```typescript
app.use(
  '*',
  logger({
    details: { instance: 'api-gateway' },
    eventIdHeader: 'x-request-id',
  })
);
```

### How It Works

1. **Trace Correlation:** If `parentEventIdHeader` is provided, the middleware checks the request headers. If found, the new logger instance becomes a child of that parent ID, preserving the trace chain. If expected but missing, an error entry is logged.
2. **Unique Identity:** Every request gets a unique `eventId` (accessible via `c.var.eventId`), which is returned to the client through the `x-event-id` response header (unless overridden with `eventIdHeader`).
3. **Area Detection:** The logger is initialized with the request pathname. In hierarchical logging, the "Area" helps categorize where the log occurred (e.g., `/v1/auth/login`).
4. **Lifecycle:** The logger is instantiated at the start of the request and persists until the response is sent, ensuring all logs within that request share the same metadata.

### Technical Details

#### Distributed Tracing Example

If Service A calls Service B:

1. **Service A** generates `eventId: 123`.
2. **Service A** calls **Service B** with header `parent-event-id: 123`.
3. **Service B** middleware detects the header and sets its internal `parentEventId` to `123`.
4. Logs from both services can now be joined in your logging dashboard (e.g., ELK, Datadog) using the common trace reference.

> [!TIP]
> **Response Headers:** The `logger` middleware returns the `eventId` to the client via the `x-event-id` header automatically, so users can provide a "Reference ID" when they encounter an error. Override the header name with the `eventIdHeader` option:
>
> ```typescript
> app.use(
>   '*',
>   logger({
>     details: { instance: 'api-gateway' },
>     eventIdHeader: 'x-request-id',
>   })
> );
> ```

## queue middleware

The `queue` middleware facilitates type-safe communication between your **Hono** API and **Cloudflare Queues**. It dynamically injects a typed producer into the request context and optionally runs a `callOnFinalization` callback once the response is complete (e.g. to dump the request's log state into the queue).

### Features

- **Context-Aware Injection:** Dynamically binds a queue producer to the Hono context using the binding name defined in your `wrangler.toml`.
- **Type-Safe Messaging:** Leverages your existing [`QueueHandler`](#queuehandler) schema to provide autocompletion and validation when sending messages.
- **Post-Response Finalization:** If a `callOnFinalization` callback is specified, the middleware invokes it once the request finishes, passing the queue producer together with the context's `get`/`env` helpers (e.g. to "dump" the current `Logger` state into the queue).
- **Trace Propagation:** Automatically carries over `parentEventId` and `language` variables into queue messages to maintain distributed tracing and localization.

### Usage

#### 1. Basic Setup

Attach the middleware to your Hono instance. You must pass the name of the binding and your pre-configured [`QueueHandler`](#queuehandler).

```typescript
import { Hono } from 'hono';
import { queue, queueHandler } from 'hono-utils';

const app = new Hono();

app.use(
  '/api/*',
  queue({
    name: 'MY_QUEUE',
    queueHandler: queueHandler,
  })
);

app.post('/process', async (c) => {
  const producer = c.get('MY_QUEUE');

  // Fully typed based on your QueueHandler schema
  await producer('email', {
    to: 'user@example.com',
    subject: 'Hello!',
    body: 'Hello, this is a test email.',
  });

  return c.text('Queued!');
});
```

#### 2. Post-Response Finalization

By combining this with the `logger` middleware, you can offload log persistence to a background worker using the `callOnFinalization` callback. It runs after `next()` finishes and receives the queue producer together with the context's `get` and `env` helpers.

```typescript
import { logger, queue } from 'hono-utils';

// 1. Initialize Logger
app.use('*', logger({ details: { instance: 'api' } }));

// 2. Initialize Queue with a finalization callback
app.use(
  '*',
  queue({
    name: 'LOG_QUEUE',
    queueHandler: logQueueHandler,
    callOnFinalization: async (producer, { get }) => {
      // 'persist_log' is the handler key in your schema
      await producer('persist_log', get('logger').dump());
    },
  })
);
```

#### 3. Finalizing Logs on Errors

The `callOnFinalization` callback above only runs when the request completes **successfully**. When a route throws, `next()` never returns, so the middleware does not run the callback — which is exactly when you usually need the error logs.

Finalize failed requests from your `onError` handler instead. The producer and the logger are both still available on the context there, because the middleware injected them before the route ran:

```typescript
import { logger, onError, queue } from 'hono-utils';

app.use('*', logger({ details: { instance: 'api' } }));

app.use('*', queue({ name: 'LOG_QUEUE', queueHandler: logQueueHandler }));

app.onError(
  onError(async (err, _env, get) => {
    const producer = get('LOG_QUEUE');
    await producer('persist_log', get('logger').dump());
    return err.message;
  })
);
```

### API Reference

#### `queue(options)`

| Option               | Type                                              | Description                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`               | `string` (Optional)                               | The environment binding name for the Queue (e.g., `'MY_QUEUE'`). When omitted, the single Queue binding available in the environment is auto-detected. Required when the environment has multiple Queue bindings. |
| `queueHandler`       | `QueueHandler`                                    | An instance of the `QueueHandler` class defining your message schema.                                                                                                                                             |
| `callOnFinalization` | `(producer, context) => Promise<void>` (Optional) | Callback invoked after the request completes. Receives the queue producer and `{ get, env }` so you can send a final message and read context variables (logger, ...) and bindings.                               |

### Technical Details

#### Dependency Requirements

- **Environment Binding:** When `name` is provided, it must exist in your `env` as a Cloudflare Queue binding. When omitted, the middleware auto-detects the single Queue binding in the environment and throws if none or more than one is found.
- **Middleware Order:** To read the `logger` inside `callOnFinalization`, the `logger` middleware **must** be registered before the `queue` middleware so that a logger instance is available in the context.

#### Message Metadata

Every message sent via the producer generated by this middleware automatically includes:

1. **`parentEventId`**: Set to the current request's `eventId` (if logger is present), ensuring background tasks are linked to the HTTP request that triggered them.
2. **`language`**: Propagates the current user's language setting to the background worker.

### Logic Flow

1. **Setup:** The middleware retrieves the Queue binding and the current `language`/`logger` from the context.
2. **Injection:** It creates a producer using `queueHandler.getProducer` and saves it to the Hono context under the provided `name`.
3. **Next:** The request moves to the next middleware or route handler.
4. **Finalization:** Once the response is ready and the stack "unwinds," the middleware invokes the `callOnFinalization` callback (if provided), passing the queue producer and the context's `get` and `env` helpers. This only happens when the request completes successfully — see [Finalizing Logs on Errors](#3-finalizing-logs-on-errors) for the failure path.

> [!NOTE]
> The `callOnFinalization` callback is executed using `await`. If your queue is experiencing heavy backpressure or latency, this may slightly delay the final response settlement of the worker, though it occurs after the business logic has finished.

## response

The `response` middleware provides a unified, type-safe API for sending consistent JSON responses from your **Hono** handlers. It ensures that every response—whether it's a success, an error, or raw data—follows a standard schema.

### Features

- **Uniform Schema:** A consistent `{ message, data }` shape for successes and errors.
- **Contentless Statuses:** Handles `204`/`205`/`304` by returning a null body instead of throwing.
- **Exception-Driven Errors:** Uses Hono's `HTTPException` for errors, allowing them to be caught by global error handlers.
- **WebSocket Support:** Includes a shorthand for protocol upgrade (101 Switching Protocols) responses.
- **Contextual Injection:** Accessible via `c.var.res` in any route handler.

### Usage

#### 1. Initialization

Register the middleware in your app.

```typescript
import { Hono } from 'hono';
import { response, type HonoResponseVariables } from 'hono-utils';

const app = new Hono<{ Variables: HonoResponseVariables }>();

app.use('*', response);
```

#### 2. Standard Success Responses

Use `res.success` for standardized messaging and data delivery.

```typescript
app.post('/items', (c) => {
  const item = { id: 1, name: 'Standard API Item' };

  // Returns 200 (default) + { message, data }
  return c.var.res.success('Item created successfully', item);
});
```

To send a message without a data payload, use `successNoContent`:

```typescript
app.post('/items', (c) => {
  // Returns 200 + { message }
  return c.var.res.successNoContent('Item queued');
});
```

#### 3. Error Handling

Use `res.error` to halt execution and return a client error.

```typescript
app.get('/protected', (c) => {
  const isAuthorized = false;

  if (!isAuthorized) {
    // Throws an HTTPException with a { message } JSON body
    return c.var.res.error('Unauthorized access', 401);
  }
});
```

### API Reference

#### `response`

Registers the middleware and injects the `res` helper into the context.

#### `c.var.res.success(message, data?, status?)`

Generates a standard success JSON response.

| Argument  | Type                 | Description                                   |
| --------- | -------------------- | --------------------------------------------- |
| `message` | `string`             | A human-readable status message.              |
| `data`    | `object`             | (Optional) The payload to return.             |
| `status`  | `ResponseStatusCode` | (Optional) Override the default `200` status. |

#### `c.var.res.successNoContent(message, status?)`

Generates a success JSON response with only a `message` (no `data`).

#### `c.var.res.error(message, status)`

Throws a standardized error response with a `{ message }` JSON body.

| Argument  | Type                    | Description                                   |
| --------- | ----------------------- | --------------------------------------------- |
| `message` | `string`                | The error message explaining what went wrong. |
| `status`  | `ClientErrorStatusCode` | The HTTP status code (e.g., 400, 404, 429).   |

#### `c.var.res.raw(data)`

Returns a JSON response from `data`. If `data` contains a `status` property, it is stripped and used as the response status; the remaining fields become the body.

#### `c.var.res.websocket(pair)`

Returns a `101 Switching Protocols` response carrying the client side of a Cloudflare `WebSocketPair` (`pair[0]`), following the Cloudflare Workers upgrade pattern:

```ts
app.get('/ws', (c) => {
  const pair = new WebSocketPair();
  pair[1].accept(); // server side — attach handlers here
  return c.var.res.websocket(pair);
});
```

Note: this helper is intended for Cloudflare Workers, which accept `101` responses with a `webSocket`. On runtimes that reject `101` responses (e.g. Node), use the runtime's own WebSocket upgrade API instead.

### Response Schema Example

When using `res.success`, the client receives a consistent JSON structure:

```json
{
  "message": "Item created successfully",
  "data": {
    "id": 1,
    "name": "Standard API Item"
  }
}
```

### Technical Details

#### Default Status

The `success`, `successNoContent`, and `raw` helpers default to `200` unless a status is explicitly passed.

#### Traceability

The [`logger`](#logger) middleware returns the request `eventId` via the `x-event-id` response header by default (override it with its `eventIdHeader` option). The `response` middleware does not manage tracing headers.

> [!TIP]
> **Debugging:** If a user reports an error, ask them for the tracing header value (`x-event-id` by default, or the name configured via the [`logger`](#logger) middleware's `eventIdHeader` option). You can use this ID to find the exact logs for that specific request in your logging dashboard.

## withLogger

The `withLogger` helper wraps a middleware implementation so it automatically receives an initialized, area-scoped logger — without having to manually check for the `logger` middleware or create a `getArea()` scope each time.

It is a factory: you pass a `name` and a `WrappableMiddleware` implementation, and you get back a standard Hono middleware to register with `app.use`.

### Features

- **Requires the `logger` middleware:** Throws a clear error when `withLogger` runs before `logger`, preventing cryptic `undefined` access errors.
- **Automatic Area Scoping:** Logs are written to a dedicated area named `middleware:${name}` (e.g. `middleware:auth`), so you can filter logs per middleware.
- **Typed Context:** The wrapped middleware receives the full, typed Hono context (`c`), so it can read bindings and any variables set by middleware registered before it.
- **Logger Utilities Included:** Alongside the scoped `info`/`warn`/`error`/`log`/`debug` methods, the wrapped middleware gets the request's `eventId` and the bound `dump`/`dumpFlat` helpers.
- **No `next()` handling:** The wrapped middleware performs its work and returns (or throws); `withLogger` calls `next()` afterwards.

### Usage

#### 1. Prerequisites

`withLogger` must run **after** the [`logger`](#logger) middleware, which injects `c.var.logger`.

```typescript
import { Hono } from 'hono';
import { logger, withLogger, type HonoLoggerVariables } from 'hono-utils';

type Env = {
  Variables: HonoLoggerVariables;
};

const app = new Hono<Env>();

app.use('*', logger({ details: { instance: 'api-gateway' } }));
```

#### 2. Wrapping a Middleware

Pass the middleware name and an implementation receiving `(c, loggerFunctions)`:

```typescript
app.use(
  '*',
  withLogger<Env>('auth', async (c, { info, debug, eventId }) => {
    debug('Checking authorization', { eventId });

    // ... authentication logic ...

    info('Request authorized');
  })
);
```

The scoped logger writes to the `middleware:auth` area. Logs appear under that key when dumping the request log:

```typescript
const dump = c.var.logger.dump();
// dump['middleware:auth'] -> [{ type: 'debug', message: 'Checking authorization', ... }, ...]
```

#### 3. Accessing the Full Log

Use `dump`/`dumpFlat` to inspect the whole request log from inside the wrapped middleware, and `eventId` to correlate it:

```typescript
app.use(
  '*',
  withLogger<Env>('metrics', async (c, { info, eventId, dumpFlat }) => {
    const eventCount = dumpFlat().filter(
      (e) => e.holder === 'middleware:metrics'
    ).length;
    info('Metrics collected', { eventId, eventCount });
  })
);
```

#### 4. Reading Other Context Variables

The wrapped middleware gets the full typed context, so it can read variables set by middleware registered before it:

```typescript
app.use(
  '*',
  withLogger<Env>('localized', async (c, { info }) => {
    info('Localized middleware ran', { language: c.get('language') });
  })
);
```

### API Reference

#### `withLogger(name, middleware)`

| Argument     | Type                     | Description                                                                                         |
| ------------ | ------------------------ | --------------------------------------------------------------------------------------------------- |
| `name`       | `string`                 | Suffix used to derive the scoped area name (`middleware:${name}`).                                  |
| `middleware` | `WrappableMiddleware<E>` | The middleware implementation. Receives `(c, loggerFunctions)` and returns `void \| Promise<void>`. |

Returns a Hono `MiddlewareHandler` that requires `Variables` to include `HonoLoggerVariables` (i.e. the `logger` middleware must be registered first).

#### `WrappableMiddleware<E>`

```typescript
type WrappableMiddleware<E extends Env> = (
  c: Context<E>,
  loggerFunctions: LoggerFunctions
) => void | Promise<void>;
```

#### `LoggerFunctions`

The second argument passed to the wrapped middleware:

| Member     | Type       | Description                                                     |
| ---------- | ---------- | --------------------------------------------------------------- |
| `info`     | `function` | Logs an `info` entry to the scoped area.                        |
| `warn`     | `function` | Logs a `warn` entry to the scoped area.                         |
| `error`    | `function` | Logs an `error` entry to the scoped area (accepts `Error` too). |
| `log`      | `function` | Logs a `log` entry to the scoped area.                          |
| `debug`    | `function` | Logs a `debug` entry to the scoped area.                        |
| `eventId`  | `string`   | The request's unique event ID (same as `c.var.eventId`).        |
| `dump`     | `function` | The request logger's `dump()` helper, bound to the logger.      |
| `dumpFlat` | `function` | The request logger's `dumpFlat()` helper, bound to the logger.  |

### Technical Details

#### Middleware Order

`withLogger` reads `c.var.logger`, which is set by the `logger` middleware. Register `logger` **before** any `withLogger` middleware:

```typescript
app.use('*', logger({ details: { instance: 'api' } })); // 1. logger first
app.use('*', withLogger<Env>('auth' /* ... */)); // 2. then wrapped middleware
```

If `logger` has not run yet, `withLogger` throws `Logger should be initialized before middleware`.

#### Bound Logger Utilities

`dump` and `dumpFlat` are bound to the request logger instance (`logger.dump.bind(logger)`), so they can be called as standalone references inside the wrapped middleware without losing their `this` context.

#### Execution Flow

1. `withLogger` reads the request logger from the context.
2. It scopes the logger to `middleware:${name}` via `getArea`.
3. It invokes the wrapped middleware with `(c, loggerFunctions)` and awaits it.
4. It calls `next()`, continuing the middleware chain (or a downstream route handler).

> [!TIP]
> **Keep middleware focused.** Because `withLogger` handles the logger lookup, scoping, and `next()` for you, the wrapped implementation only needs to contain the middleware's own logic. If the middleware fails, throw as usual — the error propagates to your global `onError` handler, where the logger is still available for dumping.

---

# Queue

## QueueHandler

`QueueHandler` is a high-level, type-safe wrapper designed for **Cloudflare Worker Queues**. It leverages [Zod](https://zod.dev/) to provide runtime validation and static type safety, ensuring that every message entering your worker conforms to a predefined schema before your business logic ever executes.

### Core Implementation

The following example demonstrates how to define a schema, establish context, and register handlers using the `QueueHandler` orchestration.

```typescript
import { QueueHandler, type MessageHandlers, type ContextFn } from 'hono-utils';
import { z } from 'zod';
import { DB } from './yourDb';

// 1. Define your message schema
export const QueueSchema = z.object({
  email: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    msg: z.string(),
  }),
});

type Environment = {
  db_url: string;
};
type QueueData = z.infer<typeof QueueSchema>;

type Context = {
  db: DB;
};

// 2. Define your dependency injection (Context)
export const setContext: ContextFn<Environment, Context> = (
  env,
  { eventId }
) => ({
  db: new DB(env.db_url, eventId),
});

export type Handlers = MessageHandlers<QueueData, Context>;

// 3. Implement specific logic handlers
const emailHandler: Handlers['email'] = async (content, { metadata }) => {
  console.log('📧 emailHandler invoked', { content, metadata });
  // YOUR LOGIC HERE
};

const logHandler: Handlers['log'] = async (content, { metadata, context }) => {
  console.log('📝 logHandler invoked', { content, metadata });
  await context.db.insert('logs', { level: content.level, msg: content.msg });
};

// 4. Orchestrate and Export
export const queueHandler = new QueueHandler({
  setContext,
  schema: QueueSchema,
  createEventId: () => crypto.randomUUID(),
})
  .addHandler('email', emailHandler)
  .addHandler('log', logHandler);

export const queue = queueHandler.getConsumer();

export type QueueProducer = ReturnType<typeof queueHandler.getProducer>;
```

### Usage in a Worker

```TypeScript
import { Hono } from 'hono'
import type { Queue } from '@cloudflare/workers-types';
import { queue } from 'hono-utils';
import { queueHandler, type QueueProducer } from './queue';

type Env = {
    Bindings: {
        QUEUE: Queue
    },
    Variables: {
        QUEUE: QueueProducer
    }
}

const app = new Hono<Env>()

app.use('*', queue({
    name: 'QUEUE',
    queueHandler,
}))

app.get('/email', async (c) => {
    await c.var.QUEUE('email', {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test',
    })
    return c.text('Email sent!')
})

export default app
```

### Export the Consumer

In your Worker's entry point (index.ts), export the consumer function.

```TypeScript
import { queue } from './queue';
import { app } from './app';

export default {
  queue,
  fetch: app.fetch,
};
```

### API Reference

#### `Constructor`

Initializes the handler with validation and context rules.

| Property                | Type                | Description                                                                                                                                                              |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema`                | `ZodObject`         | The Zod schema defining all valid message keys and their payloads.                                                                                                       |
| `setContext`            | `Function`          | A factory function that generates shared resources (DB, config) for handlers.                                                                                            |
| `createEventId`         | `() => string`      | Factory that generates a unique `eventId` for each produced message (e.g. `() => crypto.randomUUID()`).                                                                  |
| `baseRetryDelaySeconds` | `number` (Optional) | Base for the exponential backoff applied to every retry (`delaySeconds = base ** attempts`). Individual handlers can override it via `addHandler`'s `retryDelaySeconds`. |

#### `.addHandler(handlerName, handler, options?)`

Registers a processing function for a specific message type. This method is **chainable**.

- **`handlerName`**: A key from your `QueueSchema` (e.g., `'email'`).
- **`handler`**: An async function that receives the validated `content` and an object containing `context` and `metadata`.
- **`options.processAsBatch`** (Optional, defaults to `false`): When `true`, the handler receives **all** messages of this type within a consumer batch in a single call.
- **`options.retryDelaySeconds`** (Optional): Base for the exponential backoff applied when this handler's messages are retried. Overrides the constructor's `baseRetryDelaySeconds` for this handler.

##### Batch handlers (`processAsBatch: true`)

A batch handler is called once per consumer batch with:

1. **`messages`** — an array of items, in batch order, each carrying:
   - `content` — the Zod-validated message content
   - `context` — the per-message context resolved by `setContext`, plus that message's `ack`/`retry`
   - `metadata` — the per-message metadata (`eventId`, `parentEventId`, `language`, ...)
2. **`batch`** — batch-level info: `queue` (name), `ackAll()`, and `retryAll()`.

```ts
queueHandler.addHandler(
  'email',
  async (messages, batch) => {
    await sendBulk(messages.map((m) => m.content));
  },
  { processAsBatch: true }
);
```

**Failure semantics:**

- A message whose content fails schema validation is retried **individually** and excluded from the batch call, so a poison message cannot block the group.
- If the batch handler throws, **every message in the group is retried** (at-least-once semantics; make batch handlers idempotent).
- If every message in the group fails validation, the handler is not called.

#### Exponential backoff

When a message is retried and a retry delay is configured (constructor `baseRetryDelaySeconds` or the handler's `retryDelaySeconds`), the retry is scheduled with an exponential backoff:

```
delaySeconds = min(base ** attempts, 43200)
```

- `attempts` is Cloudflare's `Message.attempts` (1 on the first delivery), so delays grow `base`, `base²`, `base³`, ...
- The result is clamped to `43200` seconds (Cloudflare's 12-hour maximum), since larger values make `retry()` throw.
- Without any configured delay, messages are retried immediately (plain `retry()`).

#### `.getConsumer()`

Returns an asynchronous function compatible with the Cloudflare Worker `queue` export.

> [!IMPORTANT]
> The consumer uses `Promise.allSettled` to process batches. This means if one message fails, it will not prevent other messages in the same batch from being acknowledged or retried independently.

#### `.getProducer(queue, params)`

Generates a typed producer function to push messages into a specific Cloudflare Queue. It automatically generates a unique `eventId` using the constructor's `createEventId` factory.

### Message Processing Lifecycle

1. **Ingestion:** Cloudflare delivers a `MessageBatch` to the worker.
2. **Grouping:** The `QueueHandler` groups the batch's messages by their `handler` key, preserving order within each group.
3. **Validation:** For each message, it uses the corresponding Zod sub-schema (e.g., `QueueSchema.shape.email`) to `.parse()` the `content`. A message that fails validation is retried individually and excluded from the group.
4. **Context Creation:** `setContext` is invoked to provide the handler with necessary dependencies.
5. **Execution:** Batch handlers receive the whole group in a single call; otherwise each message runs through its individual handler. All results are settled via `allSettled`.
6. **Settlement:** If a handler is missing, it logs a warning and acks the message. If a handler throws, the affected message(s) are retried (with backoff, when configured).

---

# Router

## onError

The `onError` function is a centralized error-handling factory for **Hono** applications. It provides a standardized way to catch exceptions, optionally transform error messages, and return consistent JSON responses.

### Overview

`onError` is a higher-order function that allows you to inject custom logic for parsing error messages. It leverages Hono's `env` and `get` utilities to provide context-aware error formatting.

### Behavior

The handler follows this execution flow:

1. **Status Code Resolution:**

- Reads the error's `status` property, but only trusts it when it is an integer between `400` and `599`. Arbitrary errors that happen to carry a `status` property (e.g. `{ status: 0 }`, a string, or an upstream fetch failure) are treated as a `500`.
- Defaults to **500 Internal Server Error** when no valid status is found.

2. **Message Parsing:**

- If a `parseError` function was provided during initialization, it is called with the error, the environment (`env`), and the context getter (`get`).
- If no parser is provided, it falls back to the native `err.message`. If a parser is provided but returns `null`/`undefined`, it falls back to the `internal-error` default message.

3. **JSON Response:** Returns a JSON payload: `{ "message": "..." }` with the resolved status code.
4. **Panic Recovery:** If the parsing logic or response generation throws an unexpected error, the handler:

- Logs the original error and the secondary failure to `console.error`.
- Returns a generic error message defined in `defaultMessageMap.internalError`.

### Usage

Since `onError` is a factory, you must invoke it when registering it with your Hono instance.

#### Basic Usage

```typescript
import { Hono } from 'hono';
import { onError } from 'hono-utils';

const app = new Hono();

// Register the handler
app.onError(onError());
```

#### With Custom Parsing Logic

You can use the `parseError` callback to sanitize messages or extract specific details from your database or auth errors.

```typescript
app.onError(
  onError(async (err, env, get) => {
    // Custom logic: e.g., hide database details in production
    if (env.NODE_ENV === 'production' && err.name === 'ZodError') {
      return 'Validation failed';
    }
    return err.message;
  })
);
```

### Type Safety

The factory accepts a generic to ensure type safety when accessing environment variables or context variables within the `parseError` callback:

- **`Bindings`**: The type for `c.env`.
- **`Variables`**: The type for `c.get()`.

```typescript
app.onError(
  onError<Env>(async (err, env, get) => {
    const version = get('version'); // Type-safe access
    return `${err.message} (v${version})`;
  })
);
```

### Response Structure

#### Standard Error Response

**Status:** `err.status` (if a valid 4xx/5xx) or `500`

```json
{
  "message": "The resolved error message"
}
```

#### Emergency Fallback

If the handler itself fails, it returns a hardcoded fallback message.
**Status:** `500`

```json
{
  "message": "internal-error"
}
```

> [!NOTE]
> This handler uses `console.error` for emergency logging. For production environments, ensure your runtime environment (like Cloudflare Logs or AWS CloudWatch) captures `stdout`/`stderr`.

## onNotFound

The `onNotFound` function is a specialized handler for **Hono** applications designed to catch requests that do not match any defined routes. It provides a consistent, JSON-formatted response for 404 errors.

### Overview

By default, Hono returns a plain text "404 Not Found" response. This handler overrides that behavior to ensure that API consumers always receive a structured JSON payload, maintaining consistency across your application's error-handling strategy.

### Routing Flow

When a request enters the application, Hono attempts to match the URL and Method against the routing table. If no match is found, the execution is handed off to this handler.

1. **Request Inbound:** A client requests a resource (e.g., `GET /missing-resource`).
2. **Route Matching:** Hono scans defined paths and methods.
3. **No Match:** The router exhausts all possibilities.
4. **Handler Execution:** `onNotFound` is triggered.
5. **JSON Delivery:** The handler returns a 404 status with the localized "not found" message.

### Usage

Register the handler using the `.notFound()` method on your Hono instance.

```typescript
import { Hono } from 'hono';
import { onNotFound } from 'hono-utils';

const app = new Hono();

// Define your routes
app.get('/api/data', (c) => c.json({ data: 'ok' }));

// Register the global 404 handler
app.notFound(onNotFound);
```

### Response Structure

The handler returns a standardized JSON object and a `404` HTTP status code.

**Status:** `404 Not Found`

```json
{
  "message": "not-found"
}
```

---

# Utils

## formatZodError

The `formatZodError` function converts a [Zod](https://zod.dev) validation error into a compact, human-readable string. Instead of exposing Zod's verbose nested error object, it lists each issue as `path: message`, which is ideal for API responses and logs.

### Usage

```typescript
import { z } from 'zod';
import { formatZodError } from 'hono-utils';

const schema = z.object({
  user: z.object({
    name: z.string(),
    age: z.number(),
  }),
});

const result = schema.safeParse({ user: { name: 'Ada', age: 'old' } });

if (!result.success) {
  console.log(formatZodError(result.error));
  // => "user.age: Expected number, received string"
}
```

### API Reference

#### `formatZodError(error)`

| Parameter | Type         | Description                     |
| --------- | ------------ | ------------------------------- |
| `error`   | `z.ZodError` | The Zod error object to format. |

**Returns:** `string` — a comma-separated list of `path: message` entries.

### Output Format

Each issue is rendered as its dot-joined path followed by its message:

```
path.to.property: message
```

Multiple issues are joined with `, `:

```
name: Expected string, received number, age: Expected number, received string
```

> [!TIP]
> This utility is what powers the compact error responses returned by the [`jsonValidator`](#jsonvalidator) and [`queryValidator`](#queryvalidator) middleware.

## getSecretValue

The `getSecretValue` function normalizes access to a secret that may be supplied either as a plain string or as a Cloudflare [Secrets Store](https://developers.cloudflare.com/secrets-store/) binding. It always resolves to the secret's plain-string value, so callers can treat both forms uniformly.

### Usage

```typescript
import { getSecretValue } from 'hono-utils';

// A secret read directly from the environment as a string
const fromString = await getSecretValue('my-secret-value');

// A Secrets Store binding (e.g. `env.API_KEY`)
const fromStore = await getSecretValue(env.API_KEY);
```

### API Reference

#### `getSecretValue(value)`

| Parameter | Type                           | Description                                            |
| --------- | ------------------------------ | ------------------------------------------------------ |
| `value`   | `string \| SecretsStoreSecret` | The secret string or Secrets Store binding to resolve. |

**Returns:** `Promise<string>` — resolves to the secret's plain-string value.

When `value` is a `string` it is returned as-is. When it is a `SecretsStoreSecret`, the binding's asynchronous `get()` method is awaited.

---

# Cross-cutting notes

- **Middleware order** (Hono executes in registration order):
  - `logger` must be registered **before** `withLogger` (throws otherwise) and
    before `clientInfo` / `isBot` / `queue` when they log (`useLogger: true`)
    or read `c.var.logger`.
  - `i18n` requires a `language` variable set by middleware registered
    **before** it (throws otherwise).
  - `queue` must be registered **after** `logger` to read the logger in
    `callOnFinalization`.
- **Context variables**: `c.var.logger`, `c.var.eventId` (`logger`),
  `c.var.res` (`response`), `c.var.t` (`i18n`), `c.get('client')`
  (`clientInfo`), `c.get('isBot')` (`isBot`), `c.get('<name>')` (`queue`).
- **Cloudflare-only features**: `clientInfo` and `isBot` read `req.raw.cf` and
  throw outside the Workers runtime (or a Cloudflare proxy).
- **Errors**: `jsonValidator`/`queryValidator` throw `HTTPException` 400 with
  `formatZodError` messages; `onError`/`onNotFound` return `{ message }` JSON
  bodies; `response` standardizes success as `{ message, data }`.
- **Tracing**: `logger` returns the request `eventId` via the `x-event-id`
  response header by default (override with `eventIdHeader`).
