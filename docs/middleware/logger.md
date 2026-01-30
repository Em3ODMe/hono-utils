# Logger Middleware

The `logger` middleware integrates the [`hierarchical-area-logger`](https://github.com/Em3ODMe/hierarhical-area-logger) into **Hono**, providing a structured, context-aware logging system. It automatically handles **Distributed Tracing** by managing parent/child event IDs and tagging logs with the specific request path (Area).

---

## Features

- **Distributed Tracing:** Extracts parent Event IDs from request headers to maintain a trace across microservices.
- **Automatic Area Tagging:** Uses the request's URL pathname as the default `Area`, allowing you to filter logs by specific API endpoints easily.
- **Contextual Injection:** Attaches a unique `logger` instance and `eventId` to the Hono context for use in handlers.
- **Structured Metadata:** Injects global service details (e.g., service name, environment) into every log entry.

---

## Usage

### 1. Basic Setup

Add the `HonoLoggerVariables` to your Hono instance and apply the middleware.

```typescript
import { Hono } from 'hono';
import { logger, type HonoLoggerVariables } from './middleware/logger';

const app = new Hono<{ Variables: HonoLoggerVariables }>();

app.use(
  '*',
  logger({
    service: 'api-gateway',
  })
);
```

### 2. Using the Logger in Routes

Access the logger via `c.var.logger` to log messages that are automatically tied to the current request.

```typescript
app.get('/users/:id', async (c) => {
  const logger = c.get('logger')(); // Get the area logger

  logger.info('Fetching user data', { userId: c.req.param('id') });

  // ... logic

  return c.json({ success: true });
});
```

---

## Configuration

| Parameter             | Type                | Description                                                                                 |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `details`             | `Details`           | An object of static metadata (service name, version, etc.) included in all logs.            |
| `parentEventIdHeader` | `string` (Optional) | The name of the incoming header (e.g., `x-trace-id`) used to link logs to a parent process. |

---

## How It Works

1. **Trace Correlation:** If `parentEventIdHeader` is provided, the middleware checks the request headers. If found, the new logger instance becomes a child of that parent ID, preserving the trace chain.
2. **Unique Identity:** Every request gets a unique `eventId` (accessible via `c.var.eventId`). This ID should be returned in response headers or logged to allow for easy debugging of specific requests.
3. **Area Detection:** The logger is initialized with `defaultArea: pathname`. In hierarchical logging, the "Area" helps categorize where the log occurred (e.g., `/v1/auth/login`).
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
