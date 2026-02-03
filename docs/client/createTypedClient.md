Here is the documentation for the provided code snippet, formatted according to your requirements.

This utility acts as a **Client-Side Wrapper** (or interceptor) for Hono's RPC client (`hc`), adding lifecycle hooks and standardized error handling.

---

# Hono RPC Client Wrapper

## Features

- **Full Type-Safety:** Leverages Hono's `hc` generics to ensure end-to-end type safety between server and client.
- **Lifecycle Callbacks:** Provides hooks for `onStart`, `onSuccess`, `onError`, and `onEnd` to easily manage UI states (e.g., loading spinners, global toast notifications).
- **Automated Parsing:** Uses Hono's `parseResponse` to automatically handle JSON/Text parsing and validate `response.ok`.
- **Standardized Error Handling:** Catches fetch errors and non-200 responses, normalizing them into `HTTPException` objects.
- **Dynamic Headers:** Supports both static headers and async functions for dynamic header injection (e.g., retrieving fresh auth tokens).

## Usage

### 1. Define Types

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

### 2. Apply Wrapper

Initialize the client and wrap your RPC calls using the `rpcClient` instance.

```typescript
// client.ts
import { createTypedClient } from 'hono-utils';
import type { AppType } from './server'; // Import type from server

// Initialize the client
const rpcClient = createTypedClient<AppType>({
  url: 'http://localhost:3000',
  headers: {
    Authorization: 'Bearer token...',
  },
  callbacks: {
    onStart: () => console.log('Fetching...'),
    onSuccess: () => console.log('Done!'),
    onError: (err) => console.error('Failed', err),
    onEnd: () => console.log('Request finished'),
  },
});

// Usage example inside a function
async function getUsers() {
  try {
    // Usage: Pass a function that uses the raw 'client'
    const users = await rpcClient((client) => client.users.$get());
    console.log(users);
  } catch (error) {
    // Errors are thrown as HTTPExceptions
    console.error('API Error:', error);
  }
}
```

## Configuration

The `createTypedClient` function accepts an options object with the following properties:

| Property        | Type                     | Description                                                              |
| --------------- | ------------------------ | ------------------------------------------------------------------------ |
| **`url`**       | `string`                 | The base URL of your Hono server.                                        |
| **`headers`**   | `Record<string, string>` | `() => Promise<Record>`                                                  |
| **`fetch`**     | `typeof fetch`           | (Optional) Custom fetch implementation (e.g., for Node.js environments). |
| **`callbacks`** | `TypedClientCallbacks`   | (Optional) Lifecycle hooks for request management.                       |

### Callback Interfaces

The `callbacks` object supports the following methods:

- **`onStart()`**: Triggered immediately before the request is made.
- **`onSuccess(parsedData, headers)`**: Triggered after successful parsing and a 2xx status code.
- **`onError(parsedData, headers)`**: Triggered when a `DetailedError` occurs or parsing fails.
- **`onEnd()`**: Triggered inside the `finally` block (runs regardless of success or failure).
- **`errorHandler(status, body)`**: A specialized handler that receives the status code and error body before the exception is thrown.

## Technical Considerations

- **Hono Client (`hc`) Dependency:** This wrapper relies on `hono/client`. It specifically uses `parseResponse`, which automatically throws a `DetailedError` if the response status is not in the 200 range.
- **Exception Propagation:**
- If the fetch fails or returns a 4xx/5xx error, the wrapper catches the internal `DetailedError`.
- It then re-throws a standard **`HTTPException`**. This allows you to use `try/catch` blocks in your UI logic to handle specific status codes (e.g., redirecting on 401).

- **Header Handling:** The wrapper captures response headers and passes them to both `onSuccess` and `onError` callbacks, allowing you to read metadata (like pagination or rate limits) from headers even on failure.
- **Malformed Responses:** If the server returns an error without a detail body (or if parsing fails completely), the wrapper creates a generic `500 Fetch malformed` error to prevent silent failures.
