# withLogger Middleware Wrapper

The `withLogger` helper wraps a middleware implementation so it automatically receives an initialized, area-scoped logger — without having to manually check for the `logger` middleware or create a `getArea()` scope each time.

It is a factory: you pass a `name` and a `WrappableMiddleware` implementation, and you get back a standard Hono middleware to register with `app.use`.

---

## Features

- **Requires the `logger` middleware:** Throws a clear error when `withLogger` runs before `logger`, preventing cryptic `undefined` access errors.
- **Automatic Area Scoping:** Logs are written to a dedicated area named `middleware:${name}` (e.g. `middleware:auth`), so you can filter logs per middleware.
- **Typed Context:** The wrapped middleware receives the full, typed Hono context (`c`), so it can read bindings and any variables set by middleware registered before it.
- **Logger Utilities Included:** Alongside the scoped `info`/`warn`/`error`/`log`/`debug` methods, the wrapped middleware gets the request's `eventId` and the bound `dump`/`dumpFlat` helpers.
- **No `next()` handling:** The wrapped middleware performs its work and returns (or throws); `withLogger` calls `next()` afterwards.

---

## Usage

### 1. Prerequisites

`withLogger` must run **after** the [`logger`](logger.md) middleware, which injects `c.var.logger`.

```typescript
import { Hono } from 'hono';
import { logger, withLogger, type HonoLoggerVariables } from 'hono-utils';

type Env = {
  Variables: HonoLoggerVariables;
};

const app = new Hono<Env>();

app.use('*', logger({ details: { instance: 'api-gateway' } }));
```

### 2. Wrapping a Middleware

Pass the middleware name and an implementation receiving `(c, loggerFunctions)`:

```typescript
app.use(
  '*',
  withLogger<Env>('auth', async (c, { info, debug, eventId }) => {
    debug('Checking authorization', { eventId });

    // ... authentication logic ...

    info('Request authorized');
  })
);
```

The scoped logger writes to the `middleware:auth` area. Logs appear under that key when dumping the request log:

```typescript
const dump = c.var.logger.dump();
// dump['middleware:auth'] -> [{ type: 'debug', message: 'Checking authorization', ... }, ...]
```

### 3. Accessing the Full Log

Use `dump`/`dumpFlat` to inspect the whole request log from inside the wrapped middleware, and `eventId` to correlate it:

```typescript
app.use(
  '*',
  withLogger<Env>('metrics', async (c, { info, eventId, dumpFlat }) => {
    const eventCount = dumpFlat().filter(
      (e) => e.holder === 'middleware:metrics'
    ).length;
    info('Metrics collected', { eventId, eventCount });
  })
);
```

### 4. Reading Other Context Variables

The wrapped middleware gets the full typed context, so it can read variables set by middleware registered before it:

```typescript
app.use(
  '*',
  withLogger<Env>('localized', async (c, { info }) => {
    info('Localized middleware ran', { language: c.get('language') });
  })
);
```

---

## API Reference

### `withLogger(name, middleware)`

| Argument     | Type                     | Description                                                                                         |
| ------------ | ------------------------ | --------------------------------------------------------------------------------------------------- |
| `name`       | `string`                 | Suffix used to derive the scoped area name (`middleware:${name}`).                                  |
| `middleware` | `WrappableMiddleware<E>` | The middleware implementation. Receives `(c, loggerFunctions)` and returns `void \| Promise<void>`. |

Returns a Hono `MiddlewareHandler` that requires `Variables` to include `HonoLoggerVariables` (i.e. the `logger` middleware must be registered first).

### `WrappableMiddleware<E>`

```typescript
type WrappableMiddleware<E extends Env> = (
  c: Context<E>,
  loggerFunctions: LoggerFunctions
) => void | Promise<void>;
```

### `LoggerFunctions`

The second argument passed to the wrapped middleware:

| Member     | Type       | Description                                                     |
| ---------- | ---------- | --------------------------------------------------------------- |
| `info`     | `function` | Logs an `info` entry to the scoped area.                        |
| `warn`     | `function` | Logs a `warn` entry to the scoped area.                         |
| `error`    | `function` | Logs an `error` entry to the scoped area (accepts `Error` too). |
| `log`      | `function` | Logs a `log` entry to the scoped area.                          |
| `debug`    | `function` | Logs a `debug` entry to the scoped area.                        |
| `eventId`  | `string`   | The request's unique event ID (same as `c.var.eventId`).        |
| `dump`     | `function` | The request logger's `dump()` helper, bound to the logger.      |
| `dumpFlat` | `function` | The request logger's `dumpFlat()` helper, bound to the logger.  |

---

## Technical Details

### Middleware Order

`withLogger` reads `c.var.logger`, which is set by the `logger` middleware. Register `logger` **before** any `withLogger` middleware:

```typescript
app.use('*', logger({ details: { instance: 'api' } })); // 1. logger first
app.use('*', withLogger<Env>('auth' /* ... */)); // 2. then wrapped middleware
```

If `logger` has not run yet, `withLogger` throws `Logger should be initialized before middleware`.

### Bound Logger Utilities

`dump` and `dumpFlat` are bound to the request logger instance (`logger.dump.bind(logger)`), so they can be called as standalone references inside the wrapped middleware without losing their `this` context.

### Execution Flow

1. `withLogger` reads the request logger from the context.
2. It scopes the logger to `middleware:${name}` via `getArea`.
3. It invokes the wrapped middleware with `(c, loggerFunctions)` and awaits it.
4. It calls `next()`, continuing the middleware chain (or a downstream route handler).

---

> [!TIP]
> **Keep middleware focused.** Because `withLogger` handles the logger lookup, scoping, and `next()` for you, the wrapped implementation only needs to contain the middleware's own logic. If the middleware fails, throw as usual — the error propagates to your global `onError` handler, where the logger is still available for dumping.
