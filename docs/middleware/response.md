# Response Middleware

The `response` middleware provides a unified, type-safe API for sending consistent JSON responses from your **Hono** handlers. It ensures that every response—whether it's a success, an error, or raw data—automatically includes tracing metadata like `eventId` and adheres to your application's standard response schema.

---

## Features

- **Uniform Schema:** Automatically attaches the `eventId` to every JSON response for easy log correlation.
- **Smart Status Codes:** Defaults to `201 Created` for `POST` requests and `200 OK` for others, unless explicitly overridden.
- **Exception-Driven Errors:** Uses Hono's `HTTPException` for errors, allowing them to be caught by global error handlers while maintaining the trace ID.
- **WebSocket Support:** Includes a shorthand for protocol upgrade (101 Switching Protocols) responses.
- **Contextual Injection:** Accessible via `c.var.res` in any route handler.

---

## Usage

### 1. Initialization

Register the middleware in your app. It is recommended to place this after the `logger` middleware to ensure the `eventId` is available.

```typescript
import { Hono } from 'hono';
import { response, type HonoResponseVariables } from './middleware/response';

const app = new Hono<{ Variables: HonoResponseVariables }>();

app.use('*', response);
```

### 2. Standard Success Responses

Use `res.success` for standardized messaging and data delivery.

```typescript
app.post('/items', (c) => {
  const item = { id: 1, name: 'Standard API Item' };

  // Returns 201 Created (via POST logic) + { message, data, eventId }
  return c.var.res.success('Item created successfully', item);
});
```

### 3. Error Handling

Use `res.error` to halt execution and return a client error.

```typescript
app.get('/protected', (c) => {
  const isAuthorized = false;

  if (!isAuthorized) {
    // Throws an HTTPException + standardized error body
    return c.var.res.error('Unauthorized access', 401);
  }
});
```

---

## API Reference

### `c.var.res.success(message, data?, status?)`

Generates a standard success JSON response.

| Argument  | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| `message` | `string`            | A human-readable status message.                |
| `data`    | `object`            | (Optional) The payload to return.               |
| `status`  | `SuccessStatusCode` | (Optional) Override the default 200/201 status. |

### `c.var.res.error(message, status)`

Throws a standard error response.

| Argument  | Type                    | Description                                   |
| --------- | ----------------------- | --------------------------------------------- |
| `message` | `string`                | The error message explaining what went wrong. |
| `status`  | `ClientErrorStatusCode` | The HTTP status code (e.g., 400, 404, 429).   |

### `c.var.res.raw(data)`

Returns a JSON response where `data` is merged with the `eventId`. This is useful for third-party integrations or payloads that don't fit the `message`/`data` pattern.

### `c.var.res.websocket(socket)`

Returns a `101 Switching Protocols` response for WebSocket upgrades.

---

## Response Schema Example

When using `res.success` or `res.error`, the client receives a consistent JSON structure:

```json
{
  "message": "Item created successfully",
  "data": {
    "id": 1,
    "name": "Standard API Item"
  },
  "eventId": "clp123abc..."
}
```

---

## Technical Details

### Auto-Status Logic

The `success` method detects the HTTP verb used in the request. If the method is `POST`, it assumes a resource was created and defaults the status to `201`. For all other methods (`GET`, `PUT`, `PATCH`, `DELETE`), it defaults to `200`.

### Traceability

The `eventId` is passed into `setResponseHandlers` during the middleware phase. This ID is then injected into the `cause` property of the `HTTPException` when `res.error` is called, ensuring that even unhandled errors are traceable in your logging infrastructure.

---

> [!TIP]
> **Debugging:** If a user reports an error, ask them for the `eventId` returned in the JSON body. You can use this ID to find the exact logs for that specific request in your logging dashboard.
