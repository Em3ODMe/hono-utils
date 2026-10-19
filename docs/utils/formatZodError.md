# `formatZodError` Utility

The `formatZodError` function converts a [Zod](https://zod.dev) validation error into a compact, human-readable string. Instead of exposing Zod's verbose nested error object, it lists each issue as `path: message`, which is ideal for API responses and logs.

---

## Usage

```typescript
import { z } from 'zod';
import { formatZodError } from 'hono-utils';

const schema = z.object({
  user: z.object({
    name: z.string(),
    age: z.number(),
  }),
});

const result = schema.safeParse({ user: { name: 'Ada', age: 'old' } });

if (!result.success) {
  console.log(formatZodError(result.error));
  // => "user.age: Expected number, received string"
}
```

---

## API Reference

### `formatZodError(error)`

| Parameter | Type         | Description                     |
| --------- | ------------ | ------------------------------- |
| `error`   | `z.ZodError` | The Zod error object to format. |

**Returns:** `string` — a comma-separated list of `path: message` entries.

---

## Output Format

Each issue is rendered as its dot-joined path followed by its message:

```
path.to.property: message
```

Multiple issues are joined with `, `:

```
name: Expected string, received number, age: Expected number, received string
```

---

> [!TIP]
> This utility is what powers the compact error responses returned by the [`jsonValidator`](../middleware/jsonValidator.md) and [`queryValidator`](../middleware/queryValidator.md) middleware.
