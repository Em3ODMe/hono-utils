# `onError` Global Error Handler

The `onError` function is a centralized error-handling middleware for **Hono** applications. It ensures that every unhandled exception is logged through a hierarchical logger and returned to the client as a consistent JSON response.

---

## Overview

In a Hono application, the `onError` handler intercepts thrown `Error` objects or `HTTPException` instances. It bridges the gap between internal logging requirements and external API error reporting.

---

## Behavior

The handler follows a specific execution flow to ensure no error goes unrecorded:

1. **Hierarchical Logging:** It retrieves the `logger` from the Hono context (`c.var.logger`) and targets the `error` area. It logs both the error message and the full stack trace.
2. **Status Code Resolution:**

- If the error is an `HTTPException` (or contains a `status` property), that status is used.
- Otherwise, it defaults to a **500 Internal Server Error**.

3. **JSON Response:** It returns a standardized JSON payload containing the error message.
4. **Panic Recovery:** If the logging process itself fails (e.g., the logger is undefined), the handler catches its own exception, logs it to the standard `console.error`, and returns a generic internal error message defined in constants.

---

## Usage

To use this handler, register it with your Hono instance. Ensure that a logger middleware has already been used to populate `c.var.logger`.

```typescript
import { Hono } from 'hono';
import { onError, logger } from 'hono-utils';

const app = new Hono();

// 1. Logger must be initialized first
app.use(
  '*',
  logger({
    service: 'api-gateway',
  })
);

// 2. Register the global error handler
app.onError(onError);

app.get('/trigger-error', (c) => {
  throw new Error('Something went wrong!');
});
```

---

## Response Structure

The handler guarantees a JSON response regardless of the error type.

### Successful Error Handling

**Status:** `500` (Default) or `HTTPException.status`

```json
{
  "message": "The specific error message thrown"
}
```

### Emergency Fallback

If the handler encounters an internal failure, it returns the default internal error message.
**Status:** `500`

```json
{
  "message": "internal-error"
}
```

---

> [!IMPORTANT]
> This handler expects `logger` to be present in the Hono `Variables`. Ensure your environment types and logger middleware are correctly configured to avoid the emergency catch block.
