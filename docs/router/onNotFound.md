# `onNotFound` Handler

The `onNotFound` function is a specialized handler for **Hono** applications designed to catch requests that do not match any defined routes. It provides a consistent, JSON-formatted response for 404 errors.

---

## Overview

By default, Hono returns a plain text "404 Not Found" response. This handler overrides that behavior to ensure that API consumers always receive a structured JSON payload, maintaining consistency across your application's error-handling strategy.

---

## Routing Flow

When a request enters the application, Hono attempts to match the URL and Method against the routing table. If no match is found, the execution is handed off to this handler.

1. **Request Inbound:** A client requests a resource (e.g., `GET /missing-resource`).
2. **Route Matching:** Hono scans defined paths and methods.
3. **No Match:** The router exhausts all possibilities.
4. **Handler Execution:** `onNotFound` is triggered.
5. **JSON Delivery:** The handler returns a 404 status with the localized "not found" message.

---

## Usage

Register the handler using the `.notFound()` method on your Hono instance.

```typescript
import { Hono } from 'hono';
import { onNotFound } from './middleware/onNotFound';

const app = new Hono();

// Define your routes
app.get('/api/data', (c) => c.json({ data: 'ok' }));

// Register the global 404 handler
app.notFound(onNotFound);
```

---

## Response Structure

The handler returns a standardized JSON object and a `404` HTTP status code.

**Status:** `404 Not Found`

```json
{
  "message": "not-found"
}
```
