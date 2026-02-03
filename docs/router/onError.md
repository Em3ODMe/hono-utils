Based on the code snippet provided, I have updated the documentation to reflect that `onError` is now a **factory function** that supports a custom `parseError` callback and no longer relies on a specific `logger` variable in the context.

---

# `onError` Global Error Handler

The `onError` function is a centralized error-handling factory for **Hono** applications. It provides a standardized way to catch exceptions, optionally transform error messages, and return consistent JSON responses.

---

## Overview

Unlike a static handler, `onError` is a higher-order function that allows you to inject custom logic for parsing error messages. It leverages Hono's `env` and `get` utilities to provide context-aware error formatting.

---

## Behavior

The handler follows this execution flow:

1. **Status Code Resolution:**

- Checks if the error object contains a `status` property (common in `HTTPException`).
- Defaults to **500 Internal Server Error** if no status is found.

2. **Message Parsing:**

- If a `parseError` function was provided during initialization, it is called with the error, the environment (`env`), and the context getter (`get`).
- If no parser is provided or it returns null/undefined, it falls back to the native `err.message`.

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
import { onError } from './error-handler';

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

The factory accepts two generics to ensure type safety when accessing environment variables or context variables within the `parseError` callback:

- **`Bindings`**: The type for `c.env`.
- **`Variables`**: The type for `c.get()`.

```typescript
app.onError(
  onError<MyBindings, MyVariables>(async (err, env, get) => {
    const version = get('version'); // Type-safe access
    return `${err.message} (v${version})`;
  })
);
```

---

## Response Structure

### Standard Error Response

**Status:** `err.status` or `500`

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
