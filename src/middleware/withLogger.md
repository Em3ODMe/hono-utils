# withLogger Middleware Wrapper

The `withLogger` utility is a higher-order middleware for **Hono** that provides scoped, "Area"-specific logging for individual middleware functions. It allows you to wrap logic in a dedicated logging context, ensuring that every log message emitted by the middleware is automatically tagged with its name and linked to the global request trace.

---

## Features

- **Scoped Logging:** Automatically creates a new logging "Area" (e.g., `middleware:auth`) so logs are clearly categorized.
- **Trace Preservation:** Injects `eventId` and `parentEventId` into the middleware scope to maintain the execution chain.
- **Simplified API:** Provides direct access to logger functions (`info`, `error`, `warn`, etc.) without needing to manually extract the logger from the Hono context.
- **Initialization Guard:** Ensures the global logger is present before attempting to execute the wrapped logic.

---

## Usage

### 1. Basic Example

Wrap your custom logic with `withLogger`. The second argument receives the Hono context and a set of helper functions from the logger.

```typescript
import { Hono } from 'hono';
import { withLogger } from './middleware/withLogger';

const app = new Hono();

// Ensure global logger is initialized first!
app.use('*', logger({ service: 'api' }));

app.use(
  '*',
  withLogger('request-timer', async (c, { info }) => {
    const start = Date.now();
    info('Timer started');

    // We don't call next() here; withLogger handles it!
    c.set('startTime', start);
  })
);
```

### 2. Complex Logic with Metadata

You can access metadata like the `eventId` or the `dump` function within the wrapped middleware.

```typescript
app.use(
  '/api/*',
  withLogger('security-check', async (c, { warn, eventId }) => {
    const apiKey = c.req.header('X-API-Key');

    if (!apiKey) {
      warn('Missing API Key', { eventId });
    }
  })
);
```

---

## API Reference

### `withLogger(name, middleware)`

| Parameter    | Type                  | Description                                                               |
| ------------ | --------------------- | ------------------------------------------------------------------------- |
| `name`       | `string`              | The unique name for this middleware block. Used to prefix the log "Area". |
| `middleware` | `WrappableMiddleware` | The logic to execute. Receives `(context, loggerFunctions)`.              |

### `loggerFunctions` (The second argument)

The wrapped middleware receives an object containing:

- **Log Methods:** `info`, `warn`, `error`, `debug`, `trace` (scoped to `middleware:{name}`).
- **Trace IDs:** `eventId`, `parentEventId`.
- **Utility:** `dump()` to export the current log state.

---

## Logic Flow

1. **Context Check:** The wrapper looks for `c.get('logger')`. If missing, it throws an Error.
2. **Area Scoping:** It calls `logger.getArea("middleware:{name}")`. This ensures that any log emitted within this block is prefixed for easy filtering.
3. **Execution:** The provided `middleware` function is awaited.
4. **Continuation:** After the middleware logic completes, `withLogger` automatically calls `await next()` to pass control to the next middleware in the stack.

---

## Technical Details

### Why use `withLogger`?

In standard Hono middleware, you have to manually fetch the logger and prefix your messages:

```typescript
const logger = c.get('logger')('middleware:auth');
logger.info('user authenticated'); // Manual prefixing
```

With `withLogger`, the prefixing is handled at the infrastructure level:

```typescript
withLogger('auth', async (c, { info }) => {
  info('user authenticated'); // Automatically tagged as [middleware:auth]
});
```

---

> [!IMPORTANT]
> **Middleware Dependency:** This utility is a consumer of the `logger` middleware. It **will fail** if the global `logger` middleware is not applied to the route before `withLogger` is reached.
