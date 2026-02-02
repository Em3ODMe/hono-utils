Here is a clean, professional markdown document for your`hydrateVariable` middleware.

---

# Hydrate Variable Middleware

The `hydrateVariable` middleware is a type - safe utility for ** Hono ** that allows you to transform raw environment bindings or existing context variables into "hydrated" objects(like database clients, service instances, or parsed user data) and attach them directly to the request context.

## Features

    * ** Type Safety:** Fully leverages TypeScript generics to ensure your hydrated variables are correctly typed throughout your application.

- ** Lazy Context Population:** Ensures that complex objects are prepared and injected before your route handlers execute.
- ** Unified Access:** Provides the hydration function with access to both`env`(bindings) and`get`(existing context variables).
- ** Boilerplate Reduction:** Eliminates repetitive initialization logic inside individual route handlers.

---

## Usage

### 1. Define Types

First, define the shapes of your environment and your custom variables.

```typescript
type Bindings = {
  DB_URL: string;
};

type Variables = {
  db: MyDatabaseClient;
  user_id: string;
};
```

### 2. Apply Middleware

Initialize the middleware by providing the target variable name and the logic to create the hydrated object.

```typescript
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const dbMiddleware = hydrateVariable<Bindings, Variables, MyDatabaseClient>({
  variableName: 'db',
  hydrate: (c) => new MyDatabaseClient(c.DB_URL),
});

app.use('/api/*', dbMiddleware);

app.get('/api/profile', (c) => {
  const db = c.get('db'); // Fully typed as MyDatabaseClient
  return c.json({ status: 'Connected' });
});
```

---

## Configuration

The `hydrateVariable` factory accepts a single configuration object:

| Property             | Type              | Description                                                                                           |
| -------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| ** `variableName` ** | `keyof Variables` | The key in the Hono context(`c.set`) where the result will be stored.                                 |
| ** `hydrate` **      | `Function`        | A callback function that receives the environment and a getter.It must return the value to be stored. |

> ** Note:** The`hydrate` function has access to a merged object containing all items in `env` plus the context `get` method, allowing for dependencies between variables.

---

## Technical Considerations

    * ** Middleware Order:** Since this middleware uses`set()`, it must be defined ** before ** any routes or other middlewares that expect to `get()` the hydrated variable.

- ** Execution Timing:** The hydration logic runs on every request matching the middleware's path. For heavy operations (like establishing a physical DB connection), ensure your hydration logic handles connection pooling or caching efficiently.
  - ** TypeScript Inference:** While the middleware is highly generic, it is often helpful to explicitly pass the `Bindings` and `Variables` types to the factory to avoid "any" leakage in complex setups.
- ** Scope:** This utility uses Hono’s `createMiddleware` factory, making it compatible with any standard Hono instance(Cloudflare Workers, Bun, Node, etc.).
