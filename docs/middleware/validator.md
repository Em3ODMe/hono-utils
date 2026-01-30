# JSON Validator Middleware

The `jsonValidator` is a specialized middleware for **Hono** that utilizes **Zod** to enforce strict schema validation on incoming JSON request bodies. It acts as a gatekeeper, ensuring that your route handlers only receive data that is structurally sound and type-safe.

---

## Features

- **Type-Safe Payloads:** Automatically infers the TypeScript type of your request body based on the Zod schema.
- **Prettified Errors:** Uses `z.prettifyError` to return human-readable validation issues instead of raw JSON error arrays.
- **Automatic Rejection:** Immediately terminates requests with a `400 Bad Request` if they do not match the expected schema.
- **Seamless Hono Integration:** Built on top of Hono's native `validator` utility for native performance and compatibility.

---

## Usage

### 1. Define and Apply Schema

Define your Zod schema and pass it to the `jsonValidator` within your route definition.

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonValidator } from './middleware/jsonValidator';

const app = new Hono();

const UserSchema = z.object({
  name: z.string().min(2),
  age: z.number().int().positive(),
  email: z.string().email(),
});

app.post('/user', jsonValidator(UserSchema), (c) => {
  // Accessing validated data is fully typed
  const { name, age, email } = c.req.valid('json');

  return c.json({ success: true, user: name });
});
```

---

## API Reference

### `jsonValidator(schema)`

| Parameter | Type          | Description                                                                              |
| --------- | ------------- | ---------------------------------------------------------------------------------------- |
| `schema`  | `z.ZodObject` | The Zod schema against which the `JSON.parse()` result of the request body is validated. |

---

## Error Handling

When validation fails, the middleware throws a `hono/http-exception`. By default, the client receives a **400 status code**.

### Example Error Response

If a user submits a string for an `age` field that expects a number, the response will look like this:

```json
{
  "message": "Error: Expected number, received string at \"age\""
}
```

> [!TIP]
> **Prettified Errors:** This middleware uses `z.prettifyError(parsed.error)`. This is particularly useful for frontend developers because it converts Zod's complex nested error objects into a concise, readable string.

---

## Technical Details

### Validation Lifecycle

1. **Extraction:** The middleware intercepts the request before it reaches the handler.
2. **Parsing:** It attempts to parse the JSON body and runs it through `schema.safeParse()`.
3. **Branching:**

- **Success:** The validated data is attached to the Hono request context via `c.req.valid('json')`.
- **Failure:** An `HTTPException` is thrown, halting further execution and returning the validation error message to the client.

### Schema Requirements

The middleware expects a `ZodObject`. While Zod supports primitives (like `z.string()`), standard JSON API design generally requires the top-level body to be an object (`{}`).
