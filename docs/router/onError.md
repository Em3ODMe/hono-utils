# `onError` Global Error Handler

The `onError` function is a centralized error-handling factory for **Hono** applications. It provides a standardized way to catch exceptions, optionally transform error messages, and return consistent JSON responses.

---

## Overview

`onError` is a higher-order function that allows you to inject custom logic for parsing error messages. It leverages Hono's `env` and `get` utilities to provide context-aware error formatting.

---

## Behavior

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

---

## Usage

Since `onError` is a factory, you must invoke it when registering it with your Hono instance.

### Basic Usage

```typescript
import { Hono } from 'hono';
import { onError } from 'hono-utils';

const app = new Hono();

// Register the handler
app.onError(onError());
```

### With Custom Parsing Logic

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

---

## Type Safety

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

---

## Response Structure

### Standard Error Response

**Status:** `err.status` (if a valid 4xx/5xx) or `500`

```json
{
  "message": "The resolved error message"
}
```

### Emergency Fallback

If the handler itself fails, it returns a hardcoded fallback message.
**Status:** `500`

```json
{
  "message": "internal-error"
}
```

---

> [!NOTE]
> This handler uses `console.error` for emergency logging. For production environments, ensure your runtime environment (like Cloudflare Logs or AWS CloudWatch) captures `stdout`/`stderr`.
