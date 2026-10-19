# Response Middleware

The `response` middleware provides a unified, type-safe API for sending consistent JSON responses from your **Hono** handlers. It ensures that every response—whether it's a success, an error, or raw data—follows a standard schema.

---

## Features

- **Uniform Schema:** A consistent `{ message, data }` shape for successes and errors.
- **Contentless Statuses:** Handles `204`/`205`/`304` by returning a null body instead of throwing.
- **Exception-Driven Errors:** Uses Hono's `HTTPException` for errors, allowing them to be caught by global error handlers.
- **WebSocket Support:** Includes a shorthand for protocol upgrade (101 Switching Protocols) responses.
- **Contextual Injection:** Accessible via `c.var.res` in any route handler.

---

## Usage

### 1. Initialization

Register the middleware in your app.

```typescript
import { Hono } from 'hono';
import { response, type HonoResponseVariables } from 'hono-utils';

const app = new Hono<{ Variables: HonoResponseVariables }>();

app.use('*', response);
```

### 2. Standard Success Responses

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

### 3. Error Handling

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

---

## API Reference

### `response`

Registers the middleware and injects the `res` helper into the context.

### `c.var.res.success(message, data?, status?)`

Generates a standard success JSON response.

| Argument  | Type                 | Description                                   |
| --------- | -------------------- | --------------------------------------------- |
| `message` | `string`             | A human-readable status message.              |
| `data`    | `object`             | (Optional) The payload to return.             |
| `status`  | `ResponseStatusCode` | (Optional) Override the default `200` status. |

### `c.var.res.successNoContent(message, status?)`

Generates a success JSON response with only a `message` (no `data`).

### `c.var.res.error(message, status)`

Throws a standardized error response with a `{ message }` JSON body.

| Argument  | Type                    | Description                                   |
| --------- | ----------------------- | --------------------------------------------- |
| `message` | `string`                | The error message explaining what went wrong. |
| `status`  | `ClientErrorStatusCode` | The HTTP status code (e.g., 400, 404, 429).   |

### `c.var.res.raw(data)`

Returns a JSON response from `data`. If `data` contains a `status` property, it is stripped and used as the response status; the remaining fields become the body.

### `c.var.res.websocket(pair)`

Returns a `101 Switching Protocols` response carrying the client side of a Cloudflare `WebSocketPair` (`pair[0]`), following the Cloudflare Workers upgrade pattern:

```ts
app.get('/ws', (c) => {
  const pair = new WebSocketPair();
  pair[1].accept(); // server side — attach handlers here
  return c.var.res.websocket(pair);
});
```

Note: this helper is intended for Cloudflare Workers, which accept `101` responses with a `webSocket`. On runtimes that reject `101` responses (e.g. Node), use the runtime's own WebSocket upgrade API instead.

---

## Response Schema Example

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

---

## Technical Details

### Default Status

The `success`, `successNoContent`, and `raw` helpers default to `200` unless a status is explicitly passed.

### Traceability

The [`logger`](logger.md) middleware returns the request `eventId` via the `x-event-id` response header by default (override it with its `eventIdHeader` option). The `response` middleware does not manage tracing headers.

---

> [!TIP]
> **Debugging:** If a user reports an error, ask them for the tracing header value (`x-event-id` by default, or the name configured via the [`logger`](logger.md) middleware's `eventIdHeader` option). You can use this ID to find the exact logs for that specific request in your logging dashboard.
