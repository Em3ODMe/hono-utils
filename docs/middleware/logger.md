# Logger Middleware

The `logger` middleware integrates the [`hierarchical-area-logger`](https://github.com/Em3ODMe/hierarchical-area-logger) into **Hono**, providing a structured, context-aware logging system. It automatically handles **Distributed Tracing** by managing parent/child event IDs and tagging logs with the specific request path (Area).

---

## Features

- **Distributed Tracing:** Extracts parent Event IDs from request headers to maintain a trace across microservices.
- **Automatic Area Tagging:** Uses the request's URL pathname as the default `Area`, allowing you to filter logs by specific API endpoints easily.
- **Contextual Injection:** Attaches a unique `logger` instance and `eventId` to the Hono context for use in handlers.
- **Structured Metadata:** Injects global service details (e.g., service name, environment) into every log entry.
- **Environment-driven configuration:** Every option can be resolved per request from runtime bindings (`c.env`) and from context variables set by middleware registered before the logger.

---

## Usage

### 1. Basic Setup

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

### 2. Using the Logger in Routes

Access the logger via `c.var.logger` and log through a scoped area, automatically tied to the current request.

```typescript
app.get('/users/:id', async (c) => {
  const area = c.var.logger.getArea('users');

  area.info('Fetching user data', { userId: c.req.param('id') });

  // ... logic

  return c.json({ success: true });
});
```

---

## Configuration

| Parameter             | Type                                                                                           | Description                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `details`             | `Details \| (context) => Details \| Promise<Details>`                                          | Metadata attached to every log entry. May be resolved per request from bindings.                            |
| `parentEventIdHeader` | `string` (Optional)                                                                            | The name of the incoming header (e.g., `x-trace-id`) used to link logs to a parent process.                 |
| `createEventId`       | `(details, context) => string \| Promise<string>` (Optional)                                   | Factory that creates the event ID for the logging session. Defaults to `crypto.randomUUID()`. May be async. |
| `dumpOptions`         | `DumpLoggerOptions \| (context) => DumpLoggerOptions \| Promise<DumpLoggerOptions>` (Optional) | Default options applied on every `logger.dump()` (`omitRoot`, `finalizeLog`, `excludeLogTypes`).            |

Any option that accepts a factory (function) is **re-evaluated on every request**, which is the recommended way to configure the logger from the environment. The factory receives a resolve context:

| Context field | Type             | Description                                                           |
| ------------- | ---------------- | --------------------------------------------------------------------- |
| `bindings`    | `E['Bindings']`  | The runtime bindings of the current request (`c.env`).                |
| `variables`   | `E['Variables']` | Context variables set by middleware registered **before** the logger. |

> [!IMPORTANT]
> **Middleware Order:** Resolvers can only read variables that were set by middleware registered _before_ `logger` (Hono middleware runs in registration order). Register `logger` after the middleware that provides the variables it depends on.

### Environment-driven Configuration

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

### Variables-driven Configuration

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

### Custom Event IDs

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

---

## How It Works

1. **Trace Correlation:** If `parentEventIdHeader` is provided, the middleware checks the request headers. If found, the new logger instance becomes a child of that parent ID, preserving the trace chain. If expected but missing, an error entry is logged.
2. **Unique Identity:** Every request gets a unique `eventId` (accessible via `c.var.eventId`). This ID should be returned in response headers or logged to allow for easy debugging of specific requests.
3. **Area Detection:** The logger is initialized with the request pathname. In hierarchical logging, the "Area" helps categorize where the log occurred (e.g., `/v1/auth/login`).
4. **Lifecycle:** The logger is instantiated at the start of the request and persists until the response is sent, ensuring all logs within that request share the same metadata.

---

## Technical Details

### Distributed Tracing Example

If Service A calls Service B:

1. **Service A** generates `eventId: 123`.
2. **Service A** calls **Service B** with header `parent-event-id: 123`.
3. **Service B** middleware detects the header and sets its internal `parentEventId` to `123`.
4. Logs from both services can now be joined in your logging dashboard (e.g., ELK, Datadog) using the common trace reference.

---

> [!TIP]
> **Response Headers:** It is a best practice to send the `eventId` back to the client in a header. This allows users to provide a "Reference ID" if they encounter an error, which you can then look up instantly in your logs.
>
> ```typescript
> app.use('*', async (c, next) => {
>   await next();
>   c.header('x-event-id', c.var.eventId);
> });
> ```
